import { useState, useEffect, useRef } from 'react';

const tabs = [
  { key: 'bullets', label: '📄 Resume Bullets' },
  { key: 'cover', label: '✉️ Cover Letter' },
  { key: 'interview', label: '🎤 Interview Prep' },
  { key: 'score', label: '📊 ATS Score' },
];

const tones = ['professional', 'confident', 'warm', 'concise'];

// Fallback: call Gemini directly from client
// In production with serverless, this calls /api/tailor instead
async function callTailorAPI(jobDesc, background, tone, role) {
  // Try server API first
  try {
    const res = await fetch('/api/tailor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobDesc, background, tone, role }),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch (_) {
    // Static build — fall through to direct client call
  }

  // Direct client-side call (for static builds)
  const res = await fetch("/api/tailor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobDescription: jobDesc, resume: background }),
  });
  const { result } = await res.json();
  return result;
}

function getMockResult() {
  return {
    bullets: [
      "Developed scalable microservices architecture handling 2M+ daily requests using Node.js and Kubernetes",
      "Reduced API latency by 45% through strategic caching implementation and database query optimization",
      "Led migration from monolithic application to distributed services, improving deployment frequency by 300%",
      "Collaborated with cross-functional teams to deliver product features 2 weeks ahead of schedule",
      "Implemented CI/CD pipelines that reduced deployment time from 4 hours to 15 minutes",
      "Mentored 4 junior engineers, conducting weekly code reviews and technical workshops"
    ],
    coverLetter: "Dear Hiring Manager,\n\nI am excited to apply for this role. With extensive experience in software engineering and a proven track record of building scalable systems, I am confident I can make a significant impact on your team.\n\nIn my previous roles, I have successfully led migrations from monolithic architectures to distributed microservices, resulting in 300% faster deployment cycles and 45% reduced API latency. I thrive in collaborative environments where I can mentor junior engineers while delivering high-quality code.\n\nI would welcome the opportunity to discuss how my background in building systems at scale aligns with your team's needs. Thank you for considering my application.\n\nBest regards",
    interview: [
      { question: "Tell me about a time you improved system performance.", answer: "I identified bottlenecks in our API layer through profiling and implemented a multi-tier caching strategy using Redis. This reduced average response time from 800ms to 120ms — a 45% improvement that directly improved user satisfaction scores." },
      { question: "How do you approach technical debt?", answer: "I treat technical debt like financial debt — I track it, prioritize it, and pay it down systematically. At my last company, I allocated 20% of each sprint to refactoring, which prevented major rewrites and kept our codebase healthy." },
      { question: "Describe your experience with microservices.", answer: "I led the migration of a monolithic Python application to 12 Node.js microservices. I designed service boundaries around business domains, implemented API gateways, and set up inter-service communication with message queues." },
      { question: "How do you mentor junior developers?", answer: "I pair program weekly, conduct thorough but kind code reviews, and create learning roadmaps. I mentored 4 junior engineers who all became productive team members within 3 months." },
      { question: "What is your approach to testing?", answer: "I believe in the testing pyramid — lots of unit tests, integration tests for critical paths, and end-to-end tests for user journeys. I maintain 80%+ coverage and write tests before fixing bugs." }
    ],
    atsScore: {
      score: 78,
      missingKeywords: ["React", "TypeScript", "AWS Lambda", "GraphQL", "Agile"]
    }
  };
}

export default function TailoringTool({ defaultTab = 'bullets', defaultRole = '' }) {
  const [jobDesc, setJobDesc] = useState('');
  const [background, setBackground] = useState('');
  const [tone, setTone] = useState('professional');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [usageCount, setUsageCount] = useState(0);
  const [isPro, setIsPro] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState('');
  const resultRef = useRef(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const count = parseInt(localStorage.getItem('jobtailor_usage') || '0', 10);
      const pro = localStorage.getItem('jobtailor_pro') === 'true';
      setUsageCount(count);
      setIsPro(pro);
    }
  }, []);

  const handleGenerate = async () => {
    setError('');

    if (!isPro && usageCount >= 2) {
      setShowModal(true);
      return;
    }

    if (jobDesc.trim().length < 50 || background.trim().length < 50) {
      setError('Please enter at least 50 characters in both fields.');
      return;
    }

    setLoading(true);

    try {
      const data = await callTailorAPI(jobDesc, background, tone, defaultRole);
      setResult(data);

      if (!isPro) {
        const newCount = usageCount + 1;
        setUsageCount(newCount);
        localStorage.setItem('jobtailor_usage', String(newCount));
      }

      setTimeout(() => {
        resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } catch (err) {
      setError(err.message || 'Failed to generate. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getScoreColor = (score) => {
    if (score >= 70) return '#2A5C40';
    if (score >= 50) return '#C8A84B';
    return '#C84B4B';
  };

  const getScoreLabel = (score) => {
    if (score >= 80) return 'Excellent match';
    if (score >= 70) return 'Good match';
    if (score >= 50) return 'Moderate match';
    return 'Needs improvement';
  };

  return (
    <div id="tool" className="tt-tool">
      <div className="tt-container">
        <h2 className="tt-heading">Paste your job description &amp; background</h2>

        <div className="tt-form">
          <div className="tt-field">
            <label className="tt-label">Job description</label>
            <textarea
              className="tt-textarea"
              placeholder="Paste the full job description here..."
              value={jobDesc}
              onChange={(e) => setJobDesc(e.target.value)}
              rows={7}
            />
          </div>

          <div className="tt-field">
            <label className="tt-label">Your background</label>
            <textarea
              className="tt-textarea"
              placeholder="Paste your resume or experience summary..."
              value={background}
              onChange={(e) => setBackground(e.target.value)}
              rows={7}
            />
          </div>

          <div className="tt-field">
            <label className="tt-label">Tone</label>
            <div className="tt-tones">
              {tones.map((t) => (
                <button
                  key={t}
                  className={`tt-tone ${tone === t ? 'tt-tone-active' : ''}`}
                  onClick={() => setTone(t)}
                >
                  {t.charAt(0).toUpperCase() + t.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="tt-error">{error}</p>}

          <button
            className="btn-gold tt-generate"
            onClick={handleGenerate}
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="tt-spinner" />
                Tailoring...
              </>
            ) : (
              'Tailor my resume →'
            )}
          </button>

          <p className="tt-usage">
            {isPro ? (
              <span className="tt-pro">Pro — unlimited sessions</span>
            ) : (
              <>
                <span>{usageCount} of 2 free sessions used</span>
                {usageCount >= 1 && (
                  <span className="tt-usage-hint">
                    {' '}
                    — <a href="#stripe-link" className="tt-upgrade-link">Upgrade to Pro</a> for unlimited
                  </span>
                )}
              </>
            )}
          </p>
        </div>

        {result && (
          <div className="tt-result" ref={resultRef}>
            <div className="tt-tabs">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  className={`tt-tab ${activeTab === tab.key ? 'tt-tab-active' : ''}`}
                  onClick={() => setActiveTab(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="tt-tab-content">
              {activeTab === 'bullets' && (
                <div className="tt-content" style={{ animation: 'fadeIn 0.3s ease' }}>
                  <h3 className="tt-content-title">ATS-Optimized Resume Bullets</h3>
                  <ul className="tt-bullets">
                    {result.bullets?.map((bullet, i) => (
                      <li key={i} className="tt-bullet">
                        <span className="tt-bullet-check">✓</span>
                        {bullet}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {activeTab === 'cover' && (
                <div className="tt-content" style={{ animation: 'fadeIn 0.3s ease' }}>
                  <h3 className="tt-content-title">Your Cover Letter</h3>
                  <div className="tt-cover-letter">
                    {result.coverLetter?.split('\n\n').map((para, i) => (
                      <p key={i} className="tt-paragraph">{para}</p>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'interview' && (
                <div className="tt-content" style={{ animation: 'fadeIn 0.3s ease' }}>
                  <h3 className="tt-content-title">Interview Talking Points</h3>
                  <div className="tt-interview">
                    {result.interview?.map((item, i) => (
                      <div key={i} className="tt-interview-item">
                        <p className="tt-interview-q">Q: {item.question}</p>
                        <p className="tt-interview-a">{item.answer}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'score' && (
                <div className="tt-content" style={{ animation: 'fadeIn 0.3s ease' }}>
                  <h3 className="tt-content-title">ATS Match Score</h3>
                  <div className="tt-score-section">
                    <div className="tt-score-ring">
                      <svg viewBox="0 0 120 120" className="tt-score-svg">
                        <circle cx="60" cy="60" r="50" fill="none" stroke="#EDE8DC" strokeWidth="8" />
                        <circle
                          cx="60"
                          cy="60"
                          r="50"
                          fill="none"
                          stroke={getScoreColor(result.atsScore?.score || 0)}
                          strokeWidth="8"
                          strokeLinecap="round"
                          strokeDasharray={`${((result.atsScore?.score || 0) / 100) * 314} 314`}
                          transform="rotate(-90 60 60)"
                        />
                        <text x="60" y="55" textAnchor="middle" className="tt-score-num">
                          {result.atsScore?.score || 0}
                        </text>
                        <text x="60" y="72" textAnchor="middle" className="tt-score-label">
                          {getScoreLabel(result.atsScore?.score || 0)}
                        </text>
                      </svg>
                    </div>
                    {result.atsScore?.missingKeywords?.length > 0 && (
                      <div className="tt-keywords">
                        <p className="tt-keywords-title">Keywords to add:</p>
                        <div className="tt-keywords-list">
                          {result.atsScore.missingKeywords.map((kw, i) => (
                            <span key={i} className="tt-keyword">{kw}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {showModal && (
        <div className="tt-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="tt-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="tt-modal-title">You've used your 2 free sessions</h3>
            <p className="tt-modal-text">
              Upgrade to Pro for unlimited tailoring sessions, cover letters, ATS scores, and interview prep.
            </p>
            <div className="tt-modal-actions">
              <a href="#stripe-link" className="btn-gold">Upgrade to Pro — $12/mo</a>
              <button className="tt-modal-later" onClick={() => setShowModal(false)}>
                Maybe later
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .tt-tool {
          padding: 80px 0;
        }

        .tt-container {
          max-width: 800px;
          margin: 0 auto;
          padding: 0 24px;
        }

        .tt-heading {
          font-family: 'Fraunces', serif;
          font-size: 32px;
          line-height: 40px;
          color: var(--forest);
          text-align: center;
          margin-bottom: 40px;
        }

        .tt-form {
          background: var(--white);
          border-radius: 16px;
          padding: 48px;
          box-shadow: var(--shadow-lg);
        }

        .tt-field {
          margin-bottom: 24px;
        }

        .tt-label {
          display: block;
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-weight: 600;
          font-size: 13px;
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 8px;
        }

        .tt-textarea {
          width: 100%;
          padding: 14px 18px;
          border: 1.5px solid var(--cream2);
          border-radius: 8px;
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 15px;
          line-height: 24px;
          color: var(--ink);
          background: var(--cream);
          resize: vertical;
          transition: border-color 0.2s ease;
        }

        .tt-textarea:focus {
          outline: none;
          border-color: var(--forest);
        }

        .tt-textarea::placeholder {
          color: var(--muted);
          opacity: 0.6;
        }

        .tt-tones {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .tt-tone {
          padding: 8px 18px;
          border-radius: 6px;
          border: none;
          background: var(--cream2);
          color: var(--muted);
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-weight: 500;
          font-size: 14px;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .tt-tone:hover {
          background: #e0d9cc;
        }

        .tt-tone-active {
          background: var(--forest) !important;
          color: var(--white) !important;
        }

        .tt-generate {
          width: 100%;
          padding: 16px;
          font-size: 16px;
          margin-top: 8px;
        }

        .tt-generate:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .tt-spinner {
          display: inline-block;
          width: 18px;
          height: 18px;
          border: 2px solid rgba(26, 58, 42, 0.3);
          border-top-color: var(--forest);
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }

        .tt-error {
          color: #C84B4B;
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 14px;
          margin-bottom: 12px;
        }

        .tt-usage {
          text-align: center;
          margin-top: 16px;
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 13px;
          color: var(--muted);
        }

        .tt-pro {
          color: var(--forest);
          font-weight: 600;
        }

        .tt-upgrade-link {
          color: var(--gold);
          font-weight: 600;
          text-decoration: underline;
        }

        .tt-result {
          margin-top: 48px;
          background: var(--white);
          border-radius: 16px;
          box-shadow: var(--shadow-lg);
          overflow: hidden;
        }

        .tt-tabs {
          display: flex;
          border-bottom: 1px solid var(--cream2);
          overflow-x: auto;
        }

        .tt-tab {
          flex: 1;
          min-width: 140px;
          padding: 16px 12px;
          background: none;
          border: none;
          border-bottom: 3px solid transparent;
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-weight: 500;
          font-size: 14px;
          color: var(--muted);
          cursor: pointer;
          transition: all 0.2s ease;
          white-space: nowrap;
        }

        .tt-tab:hover {
          color: var(--forest);
          background: var(--cream);
        }

        .tt-tab-active {
          color: var(--forest) !important;
          border-bottom-color: var(--forest) !important;
          font-weight: 600 !important;
        }

        .tt-tab-content {
          padding: 40px;
        }

        .tt-content-title {
          font-family: 'Fraunces', serif;
          font-size: 20px;
          color: var(--forest);
          margin-bottom: 24px;
        }

        .tt-bullets {
          list-style: none;
        }

        .tt-bullet {
          display: flex;
          gap: 12px;
          padding: 12px 0;
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 15px;
          line-height: 24px;
          color: var(--ink);
          border-bottom: 1px solid var(--cream2);
        }

        .tt-bullet:last-child {
          border-bottom: none;
        }

        .tt-bullet-check {
          color: var(--forest2);
          font-weight: 700;
          flex-shrink: 0;
        }

        .tt-cover-letter {
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 15px;
          line-height: 26px;
          color: var(--ink);
        }

        .tt-paragraph {
          margin-bottom: 16px;
        }

        .tt-paragraph:last-child {
          margin-bottom: 0;
        }

        .tt-interview-item {
          padding: 20px 0;
          border-bottom: 1px solid var(--cream2);
        }

        .tt-interview-item:last-child {
          border-bottom: none;
        }

        .tt-interview-q {
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-weight: 600;
          font-size: 15px;
          color: var(--forest);
          margin-bottom: 8px;
        }

        .tt-interview-a {
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 14px;
          line-height: 24px;
          color: var(--muted);
        }

        .tt-score-section {
          text-align: center;
        }

        .tt-score-ring {
          width: 200px;
          height: 200px;
          margin: 0 auto 32px;
        }

        .tt-score-svg {
          width: 100%;
          height: 100%;
        }

        .tt-score-num {
          font-family: 'DM Mono', monospace;
          font-size: 32px;
          fill: var(--forest);
        }

        .tt-score-label {
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 11px;
          fill: var(--muted);
        }

        .tt-keywords {
          text-align: left;
        }

        .tt-keywords-title {
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-weight: 600;
          font-size: 14px;
          color: var(--forest);
          margin-bottom: 12px;
        }

        .tt-keywords-list {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .tt-keyword {
          display: inline-block;
          padding: 6px 14px;
          background: var(--cream2);
          border-radius: 20px;
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 13px;
          color: var(--muted);
        }

        .tt-modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(15, 26, 20, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 200;
          padding: 24px;
          animation: fadeIn 0.2s ease;
        }

        .tt-modal {
          background: var(--white);
          border-radius: 16px;
          padding: 40px;
          max-width: 440px;
          width: 100%;
          box-shadow: var(--shadow-lg);
        }

        .tt-modal-title {
          font-family: 'Fraunces', serif;
          font-size: 24px;
          color: var(--forest);
          margin-bottom: 12px;
        }

        .tt-modal-text {
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 15px;
          line-height: 24px;
          color: var(--muted);
          margin-bottom: 24px;
        }

        .tt-modal-actions {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .tt-modal-later {
          background: none;
          border: none;
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 14px;
          color: var(--muted);
          cursor: pointer;
          padding: 8px;
          transition: color 0.2s ease;
        }

        .tt-modal-later:hover {
          color: var(--forest);
        }

        @media (max-width: 768px) {
          .tt-form {
            padding: 24px;
          }

          .tt-tab-content {
            padding: 24px;
          }

          .tt-heading {
            font-size: 24px;
            line-height: 32px;
          }

          .tt-tab {
            min-width: 120px;
            font-size: 13px;
            padding: 12px 8px;
          }
        }
      `}</style>
    </div>
  );
}
