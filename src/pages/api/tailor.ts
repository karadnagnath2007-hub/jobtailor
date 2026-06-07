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
Tone: ${tone || 'professional'}
${role ? `Target role: ${role}` : ''}

JOB DESCRIPTION:
${jobDesc}

CANDIDATE BACKGROUND:
${background}

Return ONLY a valid JSON object with NO markdown, NO code blocks, NO explanation. Just raw JSON:
{
  "bullets": [
    "Achievement-focused bullet point 1 starting with action verb",
    "Achievement-focused bullet point 2 starting with action verb",
    "Achievement-focused bullet point 3 starting with action verb",
    "Achievement-focused bullet point 4 starting with action verb",
    "Achievement-focused bullet point 5 starting with action verb",
    "Achievement-focused bullet point 6 starting with action verb"
  ],
  "coverLetter": "Full 3-paragraph cover letter specific to this job. No placeholder brackets.",
  "interview": [
    { "question": "Interview question 1 relevant to this job", "answer": "Specific answer using candidate background" },
    { "question": "Interview question 2 relevant to this job", "answer": "Specific answer using candidate background" },
    { "question": "Interview question 3 relevant to this job", "answer": "Specific answer using candidate background" },
    { "question": "Interview question 4 relevant to this job", "answer": "Specific answer using candidate background" }
  ],
  "atsScore": {
    "score": 72,
    "missingKeywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"]
  }
}

Rules:
- bullets: 6 items, each starts with strong action verb, includes realistic metrics
- coverLetter: 3 paragraphs separated by newlines, specific to this role
- interview: 4 questions relevant to this exact job description
- atsScore.score: honest number 0-100 based on keyword match between job and background
- atsScore.missingKeywords: keywords from job description missing in background
- Return ONLY JSON. No extra text before or after.`;

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
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Strip markdown code blocks if Gemini wraps in them
    const clean = rawText
      .replace(/```json\n?/gi, '')
      .replace(/```\n?/g, '')
      .trim();

    let structured;
    try {
      structured = JSON.parse(clean);
    } catch {
      // If JSON parse fails, return raw text so frontend can show something
      return new Response(
        JSON.stringify({ error: 'Failed to parse AI response. Try again.' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify(structured),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ error: 'Something went wrong. Please try again.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};