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

  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) return json({ error: 'GEMINI_API_KEY not configured on server.' }, 500);

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Invalid JSON body.' }, 400); }

  const { jobDesc, background, tone = 'professional', fingerprint, token } = body;

  if (!jobDesc || !background || jobDesc.length < 50 || background.length < 50) {
    return json({ error: 'Job description and background must each be at least 50 characters.' }, 400);
  }

  // ─── DETERMINE TIER ──────────────────────────────────────────────────────────
  let tier = 'anon';
  let usageKey = `fp:${fingerprint}`;
  let usageLimit = 1;

  if (token && env.USAGE_KV) {
    const tokenData = await env.USAGE_KV.get(`token:${token}`, { type: 'json' }).catch(() => null);
    if (tokenData) {
      if (tokenData.tier === 'cancelled') {
        return json({ error: 'subscription_cancelled', message: 'Your Pro subscription has been cancelled.' }, 402);
      } else if (tokenData.tier === 'pro') {
        tier = 'pro';
        usageLimit = Infinity;
      } else if (tokenData.tier === 'email' && tokenData.emailHash) {
        tier = 'email';
        usageKey = `email:${tokenData.emailHash}`;
        usageLimit = 3;
      }
    }
  }

  // ─── CHECK USAGE ──────────────────────────────────────────────────────────────
  if (usageLimit !== Infinity && env.USAGE_KV) {
    const usage = await env.USAGE_KV.get(usageKey, { type: 'json' }).catch(() => null) || { count: 0 };
    if ((usage.count || 0) >= usageLimit) {
      return json({ error: 'limit_reached', tier }, 429);
    }
  }

  // ─── CALL GEMINI WITH CASCADE FALLBACK ───────────────────────────────────────
  const prompt = buildPrompt(jobDesc, background, tone, tier);

  const MODELS = [
    'gemini-2.5-flash-preview-05-20',
    'gemini-2.5-flash-lite-preview-06-17',
    'gemma-3-27b-it',
  ];

  let geminiResponse = null;
  let lastError = null;

  for (const model of MODELS) {
    try {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: tier === 'pro' ? 8192 : tier === 'email' ? 4096 : 2048,
            }
          })
        }
      );

      if (geminiRes.status === 429) {
        console.warn(`Rate limited on ${model}, trying next...`);
        lastError = '429';
        continue;
      }

      if (!geminiRes.ok) {
        const errText = await geminiRes.text();
        console.error(`${model} HTTP error:`, geminiRes.status, errText.slice(0, 300));
        lastError = errText;
        continue;
      }

      const geminiJson = await geminiRes.json();
      const rawText = geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text || '';

      if (!rawText) {
        console.error(`${model} returned empty text. Full response:`, JSON.stringify(geminiJson).slice(0, 500));
        lastError = 'empty';
        continue;
      }

      geminiResponse = extractJSON(rawText);

      if (!geminiResponse) {
        console.error(`${model} JSON parse failed. Raw:`, rawText.slice(0, 400));
        lastError = 'parse_failed';
        continue;
      }

      console.log(`Success with model: ${model}`);
      break;

    } catch (err) {
      console.error(`${model} fetch error:`, err.message);
      lastError = err.message;
      continue;
    }
  }

  if (!geminiResponse) {
    return json({ error: 'All AI models are currently busy. Please try again in a moment.' }, 503);
  }

  // ─── INCREMENT USAGE ──────────────────────────────────────────────────────────
  let usesLeft = Infinity;
  if (usageLimit !== Infinity && env.USAGE_KV) {
    const usage = await env.USAGE_KV.get(usageKey, { type: 'json' }).catch(() => null) || { count: 0 };
    usage.count = (usage.count || 0) + 1;
    usage.lastUsed = Date.now();
    await env.USAGE_KV.put(usageKey, JSON.stringify(usage), {
      expirationTtl: tier === 'anon' ? 60 * 60 * 24 * 30 : undefined
    }).catch(err => console.error('KV write error:', err));
    usesLeft = Math.max(0, usageLimit - usage.count);
  }

  return json({ tier, usesLeft, data: geminiResponse });
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS }
  });
}

function extractJSON(text) {
  if (!text || typeof text !== 'string') return null;

  // Strategy 1: Find outermost { ... } and parse
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try { return JSON.parse(text.slice(firstBrace, lastBrace + 1)); } catch (_) {}
  }

  // Strategy 2: Strip markdown fences then find braces
  const stripped = text
    .replace(/^[\s\S]*?```(?:json)?\s*/i, '')
    .replace(/\s*```[\s\S]*$/i, '')
    .trim();
  if (stripped.startsWith('{')) {
    try { return JSON.parse(stripped); } catch (_) {}
  }

  // Strategy 3: Simple fence removal
  const simple = text
    .replace(/^```(?:json)?\r?\n?/im, '')
    .replace(/\r?\n?```$/im, '')
    .trim();
  try { return JSON.parse(simple); } catch (_) { return null; }
}

function buildPrompt(jobDesc, background, tone, tier) {
  const base = `You are an expert career coach, ATS specialist, and professional resume writer with 15+ years of experience.

CRITICAL OUTPUT RULE: Your ENTIRE response must be ONLY the JSON object.
- The very first character must be {
- The very last character must be }
- Do NOT write anything before {
- Do NOT write anything after }
- Do NOT use markdown, code fences, or backticks
- Do NOT include explanations or commentary
- Return valid, complete JSON only

Desired tone: ${tone}

Job Description:
${jobDesc}

Candidate Background:
${background}

`;

  if (tier === 'anon') {
    return base + `Return ONLY this exact JSON structure:
{
  "resumeBullets": ["3 high-impact ATS-optimized resume bullets tailored to this job. Start each with a strong action verb. Include metrics where possible. Array of exactly 3 strings."],
  "atsScore": {
    "score": 72,
    "missingKeywords": ["keyword1", "keyword2", "keyword3"]
  }
}`;
  }

  if (tier === 'email') {
    return base + `Return ONLY this exact JSON structure:
{
  "resumeBullets": ["8 high-impact ATS-optimized bullets. Action verb + task + result format. Array of exactly 8 strings."],
  "coverLetter": "Full 3-paragraph cover letter in ${tone} tone. Hook opener, body connecting experience to role, confident closer.",
  "atsScore": {
    "score": 72,
    "grade": "B",
    "breakdown": { "keywordMatch": 70, "experienceMatch": 80, "skillsMatch": 65 },
    "presentKeywords": ["keyword1", "keyword2"],
    "missingKeywords": ["keyword3", "keyword4", "keyword5"],
    "improvementTips": ["Specific tip 1", "Specific tip 2", "Specific tip 3"]
  },
  "interviewPrep": {
    "behavioral": [
      { "question": "Tell me about a time when you...", "idealAnswer": "Use STAR method: Situation... Task... Action... Result...", "tip": "What the interviewer really wants to assess" },
      { "question": "...", "idealAnswer": "...", "tip": "..." },
      { "question": "...", "idealAnswer": "...", "tip": "..." }
    ]
  }
}`;
  }

  // Pro — full 11-section output
  return base + `Return ONLY this exact JSON structure with ALL keys fully populated:
{
  "resumeBullets": ["8 high-impact ATS-optimized bullets. Action verb + achievement + metric format."],
  "coverLetter": "Full 3-paragraph cover letter in ${tone} tone.",
  "atsScore": {
    "score": 72,
    "grade": "B",
    "breakdown": { "keywordMatch": 70, "experienceMatch": 80, "skillsMatch": 65 },
    "presentKeywords": ["keyword1", "keyword2"],
    "missingKeywords": ["keyword3", "keyword4"],
    "improvementTips": ["Specific actionable tip 1", "Specific actionable tip 2", "Specific actionable tip 3"]
  },
  "interviewPrep": {
    "behavioral": [
      { "question": "...", "idealAnswer": "...", "tip": "..." },
      { "question": "...", "idealAnswer": "...", "tip": "..." },
      { "question": "...", "idealAnswer": "...", "tip": "..." }
    ],
    "situational": [
      { "question": "...", "idealAnswer": "...", "tip": "..." },
      { "question": "...", "idealAnswer": "...", "tip": "..." },
      { "question": "...", "idealAnswer": "...", "tip": "..." }
    ],
    "technical": [
      { "question": "...", "idealAnswer": "...", "tip": "..." },
      { "question": "...", "idealAnswer": "...", "tip": "..." }
    ],
    "culturefit": [
      { "question": "...", "idealAnswer": "...", "tip": "..." },
      { "question": "...", "idealAnswer": "...", "tip": "..." }
    ]
  },
  "linkedinSummary": "Rewritten LinkedIn About section. 3 short punchy paragraphs. Achievement hook opening. First-person. Keyword-rich for this role.",
  "skillsGap": {
    "strong": ["skill clearly demonstrated 1", "skill 2"],
    "developing": ["partially shown skill"],
    "missing": ["required skill not shown 1", "required skill 2"],
    "priorityToLearn": ["most critical skill to acquire first", "second priority"],
    "learningPlan": "Concrete 30-day learning plan with specific free and paid resources to close the most critical gap."
  },
  "redFlags": [
    "Specific red flag 1 found in this job description — vague compensation, unrealistic scope, etc.",
    "Specific red flag 2...",
    "Specific red flag 3..."
  ],
  "salaryNegotiation": {
    "estimatedRange": "$X,000 - $Y,000",
    "anchorNumber": "$Z,000 — open with this because [specific rationale based on their experience]",
    "talkingPoints": ["Point 1 backed by their specific experience", "Point 2...", "Point 3..."],
    "negotiationScript": "Sample opening script: 'Based on my background in [X] and the market rate for this role...'"
  },
  "plan306090": {
    "days30": { "theme": "Learn & Observe", "goals": ["Specific goal 1", "Goal 2", "Goal 3", "Goal 4"] },
    "days60": { "theme": "Contribute & Connect", "goals": ["Specific goal 1", "Goal 2", "Goal 3", "Goal 4"] },
    "days90": { "theme": "Lead & Deliver", "goals": ["Specific goal 1", "Goal 2", "Goal 3", "Goal 4"] }
  },
  "cultureFit": {
    "score": 82,
    "signals": ["Culture signal 1 from JD", "Signal 2", "Signal 3"],
    "fitAreas": ["Area where candidate aligns with culture 1", "Area 2"],
    "watchOutFor": ["Potential culture mismatch to probe in interview"],
    "questionsToAsk": ["Smart question for interviewer 1", "Question 2", "Question 3"]
  },
  "overallReadiness": {
    "score": 76,
    "verdict": "1-2 sentence honest specific assessment of this candidacy.",
    "strengthSummary": "What genuinely makes this candidate competitive for this specific role.",
    "topPriorityAction": "The single most impactful thing to do RIGHT NOW before applying."
  }
}`;
}