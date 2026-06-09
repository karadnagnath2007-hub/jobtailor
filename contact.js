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

  const { name, email, message } = body;

  if (!name?.trim() || !email?.trim() || !message?.trim()) {
    return json({ error: 'All fields are required.' }, 400);
  }
  if (!email.includes('@') || !email.includes('.')) {
    return json({ error: 'Please enter a valid email address.' }, 400);
  }
  if (message.trim().length < 10) {
    return json({ error: 'Message is too short.' }, 400);
  }
  if (message.trim().length > 2000) {
    return json({ error: 'Message is too long (max 2000 characters).' }, 400);
  }

  if (!env.RESEND_API_KEY) {
    return json({ error: 'Email service not configured.' }, 500);
  }

  const toEmail   = env.CONTACT_EMAIL || 'hello@jobtailor.ai';
  const fromEmail = env.FROM_EMAIL    || 'onboarding@resend.dev';

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#0F1A14;">
      <div style="background:#1A3A2A;padding:24px 32px;border-radius:12px 12px 0 0;">
        <h2 style="margin:0;color:#F5F0E8;font-size:1.2rem;">New message — JobTailor AI</h2>
      </div>
      <div style="background:#F5F0E8;padding:24px 32px;">
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
          <tr>
            <td style="padding:8px 0;font-weight:700;color:#5C7065;width:80px;vertical-align:top;">Name</td>
            <td style="padding:8px 0;">${esc(name)}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;font-weight:700;color:#5C7065;vertical-align:top;">Email</td>
            <td style="padding:8px 0;"><a href="mailto:${esc(email)}" style="color:#1A3A2A;">${esc(email)}</a></td>
          </tr>
        </table>
        <div style="background:#fff;padding:16px 20px;border-radius:8px;border-left:3px solid #C8A84B;white-space:pre-wrap;line-height:1.6;">
          ${esc(message)}
        </div>
      </div>
      <div style="background:#EDE7D8;padding:12px 32px;border-radius:0 0 12px 12px;">
        <p style="margin:0;font-size:0.75rem;color:#5C7065;">Sent via JobTailor AI contact form</p>
      </div>
    </div>`;

  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `JobTailor AI <${fromEmail}>`,
      to: [toEmail],
      reply_to: email,
      subject: `Message from ${name.trim()} — JobTailor AI`,
      html,
    }),
  });

  if (!resendRes.ok) {
    const err = await resendRes.json().catch(() => ({}));
    console.error('Resend error:', err);
    return json({ error: 'Failed to send. Please email us directly.' }, 500);
  }

  return json({ success: true });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS }
  });
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
