import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
  try {
    const apiKey = import.meta.env.GEMINI_API_KEY;

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'Gemini API key not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const body = await request.json();
    const { jobDesc, background, tone, role } = body;

    if (!jobDesc || !background) {
      return new Response(
        JSON.stringify({ error: 'Job description and background are required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const prompt = `You are an expert career coach and ATS optimization specialist.
Tone preference: ${tone || 'professional'}
${role ? `Target role: ${role}` : ''}

JOB DESCRIPTION:
${jobDesc}

CANDIDATE BACKGROUND:
${background}

Respond using EXACTLY these section headers:

## Resume Bullets
Write 6-8 achievement-focused bullet points tailored to this specific job. Start each with a strong action verb. Include realistic metrics.

## Cover Letter
Write a 3-paragraph cover letter. No placeholder brackets. Make it specific to this role.

## Interview Talking Points
Give 4-5 talking points formatted as: "When asked about [topic], highlight [specific point]."

## Keywords
Strong: [keyword1], [keyword2], [keyword3]
Missing: [keyword1], [keyword2]
Improve: [keyword1], [keyword2]

## ATS Score: [number 0-100]
Be realistic. Most people score 40-75.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048,
          },
        }),
      }
    );

    if (!response.ok) {
      const err = await response.json();
      return new Response(
        JSON.stringify({ error: err.error?.message || 'Gemini API error' }),
        { status: response.status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    return new Response(
      JSON.stringify({ success: true, text }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Something went wrong' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};