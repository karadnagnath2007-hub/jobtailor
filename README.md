# JobTailor AI

AI-powered resume tailoring tool. Paste a job description and your background to get ATS-optimized resume bullets, a tailored cover letter, deep interview preparation, LinkedIn summary rewrite, skills gap analysis, salary negotiation script, 30-60-90 day plan, and culture fit analysis..

## Features

- **ATS Score & Breakdown** — Keyword match, experience alignment, and skills analysis
- **Resume Bullets** — 8 high-impact, ATS-optimized bullets tailored to each job
- **Cover Letter** — Full 3-paragraph cover letter in your chosen tone
- **Interview Prep** — Behavioral, situational, technical, and culture-fit Q&A
- **LinkedIn Rewrite** — Optimized About section for the specific role
- **Skills Gap Analysis** — Strengths, gaps, and a 30-day learning plan
- **Red Flag Detection** — Warning signs spotted in job descriptions
- **Salary Negotiation** — Market range, anchor number, and talking points
- **30-60-90 Day Plan** — Concrete goals for your first 3 months
- **Culture Fit Analysis** — Signals, alignment areas, and smart questions to ask
- **Overall Readiness** — Candidacy score and top priority action

## File Structure

```
jobtailor-ai/
  index.html                    — Single-page app (HTML)
  styles.css                    — All styles (CSS)
  app.js                        — Frontend logic (JS)
  robots.txt                    — SEO robots file
  sitemap.xml                   — SEO sitemap
  functions/
    api/
      tailor.js                 — Cloudflare Function: AI endpoint
      register.js               — Cloudflare Function: email registration
  .gitignore
  .env.example
  README.md
```

## Tech Stack

- **Frontend:** Plain HTML + CSS + JavaScript (no frameworks)
- **Backend:** Cloudflare Pages Functions (serverless)
- **Storage:** Cloudflare KV (usage tracking)
- **AI:** Google Gemini 3.5 Flash API

## Deployment Guide

### Prerequisites

- A Cloudflare account
- A Google AI Studio API key ([get one here](https://aistudio.google.com))

### Step 1: Push to GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/yourusername/jobtailor-ai.git
git push -u origin main
```

### Step 2: Create Cloudflare Pages Project

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) &rarr; Pages &rarr; Create a project
2. Connect your GitHub repository
3. Build settings:
   - **Framework preset:** None
   - **Build command:** (empty)
   - **Output directory:** `/`
4. Click **Deploy**

### Step 3: Set Up KV Namespace

1. Go to Cloudflare Dashboard &rarr; Workers & Pages &rarr; KV
2. Click **Create a namespace** &rarr; Name it `USAGE_KV`
3. Go back to your Pages project &rarr; Settings &rarr; Functions &rarr; KV namespace bindings
4. Add binding:
   - **Variable name:** `USAGE_KV`
   - **KV namespace:** Select `USAGE_KV`

### Step 4: Set Environment Variables

1. Pages project &rarr; Settings &rarr; Environment variables
2. Add: `GEMINI_API_KEY` = your API key from [Google AI Studio](https://aistudio.google.com)
3. Add to **both Production and Preview** environments

### Step 5: Deploy

Push any change to trigger a redeploy, or click **Retry deployment** in the dashboard.

## Tier System

| Tier | Authentication | Uses | Features |
|------|---------------|------|----------|
| Anonymous | Browser fingerprint | 1 | 3 resume bullets + basic ATS score |
| Email | Email + token | 3 | 8 bullets + cover letter + full ATS + 3 behavioral Q&As |
| Pro | Pro token | Unlimited | All 11 sections |

## Local Development (Optional)

```bash
# Install Wrangler globally
npm install -g wrangler

# Run local dev server with KV
wrangler pages dev . --kv USAGE_KV
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `GEMINI_API_KEY` | Google Gemini API key | Yes |

## License

Copyright 2026 JobTailor AI. All rights reserved.
