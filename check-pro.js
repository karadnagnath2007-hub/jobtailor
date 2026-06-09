const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestGet(context) {
  const { request, env } = context;

  if (!env.USAGE_KV) return json({ tier: 'anon', found: false });

  const fp = new URL(request.url).searchParams.get('fp');
  if (!fp) return json({ tier: 'anon', found: false });

  const fpRecord = await env.USAGE_KV.get(`fp:${fp}`, { type: 'json' }).catch(() => null);

  if (!fpRecord?.proToken) {
    return json({
      tier: fpRecord?.linkedToken ? 'email' : 'anon',
      found: false
    });
  }

  // Verify the token is still active
  const tokenRecord = await env.USAGE_KV.get(`token:${fpRecord.proToken}`, { type: 'json' }).catch(() => null);

  if (tokenRecord?.tier === 'pro') {
    return json({ tier: 'pro', proToken: fpRecord.proToken, found: true });
  }

  if (tokenRecord?.tier === 'cancelled') {
    return json({ tier: 'cancelled', found: false });
  }

  return json({ tier: 'anon', found: false });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS }
  });
}
