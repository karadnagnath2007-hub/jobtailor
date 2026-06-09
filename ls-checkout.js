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

  if (!env.LS_API_KEY)    return json({ error: 'LS_API_KEY not configured.' }, 500);
  if (!env.LS_STORE_ID)   return json({ error: 'LS_STORE_ID not configured.' }, 500);
  if (!env.LS_VARIANT_ID) return json({ error: 'LS_VARIANT_ID not configured.' }, 500);

  let body = {};
  try { body = await request.json(); } catch {}

  const { fingerprint = '', token = '' } = body;
  const origin = new URL(request.url).origin;

  // Lemon Squeezy uses JSON:API format
  const payload = {
    data: {
      type: 'checkouts',
      attributes: {
        checkout_data: {
          custom: { fingerprint, token }
        },
        product_options: {
          redirect_url: `${origin}/?ls_success=1`
        },
        checkout_options: {
          embed: false,
          discount: true
        }
      },
      relationships: {
        store:   { data: { type: 'stores',   id: String(env.LS_STORE_ID)   } },
        variant: { data: { type: 'variants', id: String(env.LS_VARIANT_ID) } }
      }
    }
  };

  const lsRes = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.LS_API_KEY}`,
      'Content-Type': 'application/vnd.api+json',
      'Accept': 'application/vnd.api+json',
    },
    body: JSON.stringify(payload)
  });

  const lsData = await lsRes.json();

  if (!lsRes.ok) {
    console.error('LemonSqueezy error:', JSON.stringify(lsData).slice(0, 400));
    return json({ error: lsData?.errors?.[0]?.detail || 'Failed to create checkout.' }, 502);
  }

  const checkoutUrl = lsData?.data?.attributes?.url;
  if (!checkoutUrl) {
    return json({ error: 'No checkout URL returned from LemonSqueezy.' }, 502);
  }

  return json({ url: checkoutUrl });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS }
  });
}
