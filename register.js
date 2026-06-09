const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Invalid JSON.' }, 400); }

  const { email, fingerprint } = body;

  if (!email || !email.includes('@') || !email.includes('.')) {
    return json({ error: 'Please enter a valid email address.' }, 400);
  }

  // Hash the email (SHA-256 via Web Crypto — no Node.js needed)
  const emailLower = email.toLowerCase().trim();
  const encoded = new TextEncoder().encode(emailLower);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const emailHash = Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0')).join('');

  const kvKey = `email:${emailHash}`;

  // Check if already registered
  if (env.USAGE_KV) {
    const existing = await env.USAGE_KV.get(kvKey, { type: 'json' }).catch(() => null);
    if (existing && existing.token) {
      const usesLeft = Math.max(0, 3 - (existing.count || 0));
      return json({ token: existing.token, usesLeft, existing: true });
    }
  }

  // Create new token — prefix tok_ so tailor.js knows it's email tier
  const token = 'tok_' + crypto.randomUUID().replace(/-/g, '');

  const emailRecord = {
    token,
    emailHash,
    count: 0,
    createdAt: Date.now(),
    tier: 'email'
  };

  const tokenRecord = {
    emailHash,
    tier: 'email'
  };

  if (env.USAGE_KV) {
    await env.USAGE_KV.put(kvKey, JSON.stringify(emailRecord)).catch(() => {});
    await env.USAGE_KV.put(`token:${token}`, JSON.stringify(tokenRecord)).catch(() => {});

    // Link fingerprint to token so check-pro polling can find upgrades
    if (fingerprint) {
      const fpRecord = await env.USAGE_KV.get(`fp:${fingerprint}`, { type: 'json' }).catch(() => null) || {};
      fpRecord.linkedToken = token;
      await env.USAGE_KV.put(`fp:${fingerprint}`, JSON.stringify(fpRecord), {
        expirationTtl: 60 * 60 * 24 * 30
      }).catch(() => {});
    }
  }

  return json({ token, usesLeft: 3, existing: false });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS }
  });
}
