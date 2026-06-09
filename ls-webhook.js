// Lemon Squeezy sends webhooks with header: X-Signature (HMAC SHA256 of raw body)

export async function onRequestPost(context) {
  const { request, env } = context;

  const signature = request.headers.get('x-signature') || '';
  const rawBody   = await request.text();

  // Always verify signature first
  const isValid = await verifySignature(rawBody, signature, env.LS_WEBHOOK_SECRET);
  if (!isValid) {
    console.error('LemonSqueezy webhook: invalid signature');
    return new Response('Invalid signature', { status: 401 });
  }

  let event;
  try { event = JSON.parse(rawBody); }
  catch { return new Response('Invalid JSON', { status: 400 }); }

  const eventName  = event?.meta?.event_name;
  const customData = event?.meta?.custom_data || {};
  const attributes = event?.data?.attributes   || {};

  console.log('LemonSqueezy webhook:', eventName);

  // Payment events → grant Pro
  if (eventName === 'order_created' && attributes.status === 'paid') {
    await grantPro(env, customData, attributes);
  }

  if (eventName === 'subscription_created') {
    await grantPro(env, customData, attributes);
  }

  // Cancellation events → revoke Pro
  if (eventName === 'subscription_cancelled' || eventName === 'subscription_expired') {
    await revokePro(env, attributes);
  }

  return new Response('OK', { status: 200 });
}

async function grantPro(env, customData, attributes) {
  if (!env.USAGE_KV) return;

  const fingerprint      = customData?.fingerprint || '';
  const existingToken    = customData?.token        || '';
  const customerEmail    = attributes?.user_email   || attributes?.customer_email || '';
  const lsSubscriptionId = attributes?.id           || '';

  // Idempotency — don't issue two tokens for the same subscription
  if (lsSubscriptionId) {
    const already = await env.USAGE_KV.get(`ls_sub:${lsSubscriptionId}`).catch(() => null);
    if (already) { console.log('Pro already issued for sub:', lsSubscriptionId); return; }
  }

  const proToken = 'pro_' + crypto.randomUUID().replace(/-/g, '');

  const tokenRecord = {
    tier: 'pro',
    email: customerEmail,
    lsSubscriptionId,
    fingerprint,
    createdAt: Date.now()
  };

  await env.USAGE_KV.put(`token:${proToken}`, JSON.stringify(tokenRecord)).catch(() => {});

  if (lsSubscriptionId) {
    await env.USAGE_KV.put(`ls_sub:${lsSubscriptionId}`, proToken).catch(() => {});
  }

  // Link to fingerprint so check-pro polling finds it
  if (fingerprint) {
    const fpRecord = await env.USAGE_KV.get(`fp:${fingerprint}`, { type: 'json' }).catch(() => null) || {};
    fpRecord.proToken = proToken;
    fpRecord.tier     = 'pro';
    await env.USAGE_KV.put(`fp:${fingerprint}`, JSON.stringify(fpRecord), {
      expirationTtl: 60 * 60 * 24 * 365
    }).catch(() => {});
  }

  // Also upgrade existing email token if one was passed
  if (existingToken && existingToken.startsWith('tok_')) {
    const existRec = await env.USAGE_KV.get(`token:${existingToken}`, { type: 'json' }).catch(() => null);
    if (existRec?.emailHash) {
      const emailRec = await env.USAGE_KV.get(`email:${existRec.emailHash}`, { type: 'json' }).catch(() => null);
      if (emailRec) {
        emailRec.tier     = 'pro';
        emailRec.proToken = proToken;
        await env.USAGE_KV.put(`email:${existRec.emailHash}`, JSON.stringify(emailRec)).catch(() => {});
      }
    }
  }

  console.log('Pro granted:', proToken, 'fingerprint:', fingerprint);
}

async function revokePro(env, attributes) {
  if (!env.USAGE_KV) return;
  const lsSubscriptionId = attributes?.id || '';
  if (!lsSubscriptionId) return;

  const proToken = await env.USAGE_KV.get(`ls_sub:${lsSubscriptionId}`).catch(() => null);
  if (!proToken) return;

  const rec = await env.USAGE_KV.get(`token:${proToken}`, { type: 'json' }).catch(() => null);
  if (rec) {
    rec.tier        = 'cancelled';
    rec.cancelledAt = Date.now();
    await env.USAGE_KV.put(`token:${proToken}`, JSON.stringify(rec)).catch(() => {});
    console.log('Pro revoked:', proToken);
  }
}

// HMAC SHA256 verification using Web Crypto API (no Node.js modules needed)
async function verifySignature(rawBody, signature, secret) {
  if (!signature || !secret || !rawBody) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );
  const sigBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(rawBody));
  const computedHex = Array.from(new Uint8Array(sigBuffer))
    .map(b => b.toString(16).padStart(2, '0')).join('');

  // Constant-time comparison
  if (computedHex.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < computedHex.length; i++) {
    diff |= computedHex.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}
