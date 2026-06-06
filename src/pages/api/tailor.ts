import type { APIRoute } from 'astro';
import { GoogleGenerativeAI } from '@google/generative-ai';

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

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const prompt = `You are an expert resume writer and career coach. Given a job description and a candidate's background, provide:

1. ATS-optimized resume bullet points (4-6 bullets)
2. A personalized cover letter (3-4 paragraphs)
3. Interview talking points (5 key points with example answers)
4. An ATS match score (0-100) with specific missing keywords

Return ONLY valid JSON in this exact format:
{
  "bullets": ["string"],
  "coverLetter": "string",
  "interview": [{"question": "string", "answer": "string"}],
  "atsScore": { "score": number, "missingKeywords": ["string"] }
}

Job Description: ${jobDesc}
Candidate Background: ${background}
Tone: ${tone || 'professional'}
${role ? `Target Role: ${role}` : ''}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // Extract JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return new Response(
        JSON.stringify({ error: 'Failed to parse AI response' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
