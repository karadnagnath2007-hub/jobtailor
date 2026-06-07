/* ============================================
   JobTailor AI — Frontend Logic
   ============================================ */

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  // Generate or load fingerprint
  getOrCreateFingerprint();

  // Load tier and token
  const tier = localStorage.getItem('jt_tier') || 'anon';
  const token = localStorage.getItem('jt_token');

  // Update UI based on tier
  updateUsageDisplay(getUsesLeftFromTier(tier));

  // Attach character counters
  attachCharCounter('job-desc', 'job-desc-counter', 50);
  attachCharCounter('background', 'background-counter', 50);

  // Close modals on backdrop click
  document.getElementById('email-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeEmailModal();
  });
  document.getElementById('upgrade-modal').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeUpgradeModal();
  });

  // Close modals on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeEmailModal();
      closeUpgradeModal();
    }
  });
});

// ============================================
// FINGERPRINTING
// ============================================

function getOrCreateFingerprint() {
  let fp = localStorage.getItem('jt_fp');
  if (!fp) {
    fp = generateFingerprint();
    localStorage.setItem('jt_fp', fp);
  }
  return fp;
}

function generateFingerprint() {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.textBaseline = 'top';
  ctx.font = '14px Arial';
  ctx.fillStyle = '#0f0';
  ctx.fillRect(125, 1, 62, 20);
  ctx.fillStyle = '#039';
  ctx.fillText('jobtailor', 2, 15);
  const canvasData = canvas.toDataURL().slice(-40);

  const raw = [
    navigator.userAgent,
    navigator.language,
    screen.width + 'x' + screen.height + 'x' + screen.colorDepth,
    new Date().getTimezoneOffset(),
    canvasData,
    navigator.hardwareConcurrency || ''
  ].join('||');

  let hash = 5381;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) + hash) + raw.charCodeAt(i);
    hash = hash & hash; // 32-bit
  }
  return 'fp_' + Math.abs(hash).toString(36);
}

function getUsesLeftFromTier(tier) {
  if (tier === 'pro') return Infinity;
  // We don't know exact uses left on init; will update after first API call
  return tier === 'email' ? 3 : 1;
}

// ============================================
// FORM SUBMISSION
// ============================================

async function submitForm() {
  const jobDesc = document.getElementById('job-desc').value.trim();
  const background = document.getElementById('background').value.trim();
  const tone = document.querySelector('input[name="tone"]:checked')?.value || 'professional';

  if (jobDesc.length < 50 || background.length < 50) {
    showError('Please provide at least 50 characters in each field.');
    return;
  }

  const fingerprint = getOrCreateFingerprint();
  const token = localStorage.getItem('jt_token') || null;
  const tier = localStorage.getItem('jt_tier') || 'anon';

  setLoadingState(true);
  clearError();

  try {
    const res = await fetch('/api/tailor', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobDesc, background, tone, fingerprint, token })
    });

    const json = await res.json();

    if (!res.ok) {
      if (json.error === 'limit_reached') {
        if (tier === 'anon') {
          openEmailModal();
        } else {
          openUpgradeModal();
        }
        return;
      }
      throw new Error(json.error || 'Something went wrong');
    }

    // Update tier info from response
    if (json.tier) {
      localStorage.setItem('jt_tier', json.tier);
      updateUsageDisplay(json.usesLeft);
    }

    displayResults(json.data, json.tier);
    document.getElementById('results-section').scrollIntoView({ behavior: 'smooth', block: 'start' });

  } catch (err) {
    showError(err.message || 'Failed to generate. Please try again.');
  } finally {
    setLoadingState(false);
  }
}

// ============================================
// RESULTS DISPLAY
// ============================================

function displayResults(data, tier) {
  const resultsSection = document.getElementById('results-section');
  const tabsContainer = resultsSection.querySelector('.tabs');
  const panelsContainer = resultsSection.querySelector('.tab-panels');

  resultsSection.hidden = false;
  tabsContainer.innerHTML = '';
  panelsContainer.innerHTML = '';

  // Define tabs for each tier
  const tabDefs = getTabDefinitions(tier);

  tabDefs.forEach((tab, index) => {
    // Create tab button
    const btn = document.createElement('button');
    btn.className = 'tab-btn' + (tab.locked ? ' tab-locked' : '') + (index === 0 ? ' active' : '');
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', index === 0 ? 'true' : 'false');
    btn.textContent = (tab.locked ? '\uD83D\uDD12 ' : '') + tab.label;
    if (tab.locked) {
      btn.onclick = () => openUpgradeModal();
    } else {
      btn.setAttribute('data-tab', tab.id);
      btn.onclick = () => switchTab(tab.id);
    }
    tabsContainer.appendChild(btn);

    // Create panel
    const panel = document.createElement('div');
    panel.className = 'tab-panel' + (index === 0 ? ' active' : '');
    panel.id = 'panel-' + tab.id;
    panel.setAttribute('role', 'tabpanel');

    if (!tab.locked && tab.renderer) {
      panel.innerHTML = tab.renderer(data);
    } else if (tab.locked) {
      panel.innerHTML = renderLockedSection(tab.id, tab.label, tab.description);
    }

    panelsContainer.appendChild(panel);
  });
}

function getTabDefinitions(tier) {
  const allTabs = [
    { id: 'resume', label: tier === 'anon' ? '3 Resume Bullets' : 'Resume Bullets', locked: false, renderer: renderResumeTab },
    { id: 'ats', label: 'ATS Score', locked: false, renderer: renderAtsTab },
    { id: 'cover', label: 'Cover Letter', locked: tier === 'anon', description: 'A tailored 3-paragraph cover letter connecting your experience to this exact role.', renderer: renderCoverTab },
    { id: 'interview', label: 'Interview Prep', locked: tier === 'anon', description: 'Behavioral, situational, technical, and culture-fit questions with ideal answers.', renderer: renderInterviewTab },
    { id: 'linkedin', label: 'LinkedIn Rewrite', locked: tier !== 'pro', description: 'A fully optimized LinkedIn About section crafted for this exact role and your background.', renderer: renderLinkedInTab },
    { id: 'skills', label: 'Skills Gap', locked: tier !== 'pro', description: 'Analysis of your strengths, gaps, and a concrete 30-day learning plan.', renderer: renderSkillsTab },
    { id: 'redflags', label: 'Red Flags', locked: tier !== 'pro', description: 'Warning signs detected in this job description you should know about.', renderer: renderRedFlagsTab },
    { id: 'salary', label: 'Salary Negotiation', locked: tier !== 'pro', description: 'Market-aligned salary range, anchor number, and negotiation script.', renderer: renderSalaryTab },
    { id: 'plan', label: '30-60-90 Plan', locked: tier !== 'pro', description: 'A concrete 30-60-90 day plan to hit the ground running in this role.', renderer: renderPlanTab },
    { id: 'culture', label: 'Culture Fit', locked: tier !== 'pro', description: 'Culture signals from the JD and smart questions to ask your interviewer.', renderer: renderCultureTab },
    { id: 'readiness', label: 'Overall Readiness', locked: tier !== 'pro', description: 'Your candidacy score, competitive strengths, and top priority action.', renderer: renderReadinessTab },
  ];

  // For anon tier, rename resume tab and adjust
  if (tier === 'anon') {
    allTabs[0].label = '3 Resume Bullets';
  }

  return allTabs;
}

// ============================================
// TAB RENDERERS
// ============================================

function renderResumeTab(data) {
  const bullets = data.resumeBullets || [];
  const tier = localStorage.getItem('jt_tier') || 'anon';

  let html = '<ul class="bullets-list">';
  bullets.forEach(bullet => {
    html += `<li class="bullet-item">${escapeHtml(bullet)}</li>`;
  });
  html += '</ul>';

  // Teaser for anon users
  if (tier === 'anon' && bullets.length <= 3) {
    html += `
      <div class="teaser-banner">
        <p>5 more powerful resume bullets unlocked with Email signup</p>
        <button class="btn btn-gold btn-sm" onclick="openEmailModal()">Get 3 free uses &rarr;</button>
      </div>
    `;
  }

  return html;
}

function renderAtsTab(data) {
  const ats = data.atsScore || {};
  const tier = localStorage.getItem('jt_tier') || 'anon';
  const score = ats.score || 0;

  let html = '<div class="ats-container">';

  // Score ring
  html += `<div class="ats-ring-wrapper">${renderAtsRing(score)}</div>`;

  // Full breakdown for email+ tiers
  if (tier !== 'anon' && ats.breakdown) {
    html += '<div class="ats-breakdown">';
    html += `<div class="breakdown-item"><div class="breakdown-label">Keywords</div><div class="breakdown-value">${ats.breakdown.keywordMatch || 0}%</div></div>`;
    html += `<div class="breakdown-item"><div class="breakdown-label">Experience</div><div class="breakdown-value">${ats.breakdown.experienceMatch || 0}%</div></div>`;
    html += `<div class="breakdown-item"><div class="breakdown-label">Skills</div><div class="breakdown-value">${ats.breakdown.skillsMatch || 0}%</div></div>`;
    html += '</div>';
  }

  // Keywords
  html += '<div class="ats-keywords">';

  if (tier !== 'anon' && ats.presentKeywords && ats.presentKeywords.length > 0) {
    html += '<h4>Present Keywords</h4>';
    html += '<div class="keyword-list">';
    ats.presentKeywords.forEach(kw => {
      html += `<span class="keyword-tag keyword-present">${escapeHtml(kw)}</span>`;
    });
    html += '</div>';
  }

  if (ats.missingKeywords && ats.missingKeywords.length > 0) {
    html += '<h4>Missing Keywords</h4>';
    html += '<div class="keyword-list">';
    ats.missingKeywords.forEach(kw => {
      html += `<span class="keyword-tag keyword-missing">${escapeHtml(kw)}</span>`;
    });
    html += '</div>';
  }

  html += '</div>';

  // Improvement tips for email+ tiers
  if (tier !== 'anon' && ats.improvementTips && ats.improvementTips.length > 0) {
    html += '<div class="ats-tips">';
    html += '<h4>Improvement Tips</h4>';
    html += '<ul class="tips-list">';
    ats.improvementTips.forEach(tip => {
      html += `<li>${escapeHtml(tip)}</li>`;
    });
    html += '</ul></div>';
  }

  html += '</div>';
  return html;
}

function renderCoverTab(data) {
  const letter = data.coverLetter || 'No cover letter generated.';
  return `<div class="cover-letter">${escapeHtml(letter)}</div>`;
}

function renderInterviewTab(data) {
  const prep = data.interviewPrep || {};
  const tier = localStorage.getItem('jt_tier') || 'anon';

  let html = '';

  const categories = [
    { key: 'behavioral', label: 'Behavioral' },
    { key: 'situational', label: 'Situational' },
    { key: 'technical', label: 'Technical' },
    { key: 'culturefit', label: 'Culture Fit' },
  ];

  categories.forEach(cat => {
    const questions = prep[cat.key];
    if (!questions || questions.length === 0) return;

    // For email tier, only show behavioral
    if (tier === 'email' && cat.key !== 'behavioral') return;

    html += `<div class="interview-section"><h4>${cat.label}</h4>`;
    questions.forEach(q => {
      html += `
        <div class="interview-card">
          <div class="interview-question">${escapeHtml(q.question)}</div>
          <div class="interview-answer">${escapeHtml(q.idealAnswer)}</div>
          <div class="interview-tip">${escapeHtml(q.tip)}</div>
        </div>
      `;
    });
    html += '</div>';
  });

  return html || '<p>No interview questions available.</p>';
}

function renderLinkedInTab(data) {
  const summary = data.linkedinSummary || 'No LinkedIn summary generated.';
  return `<div class="linkedin-summary">${escapeHtml(summary)}</div>`;
}

function renderSkillsTab(data) {
  const skills = data.skillsGap || {};

  let html = '<div class="skills-grid">';

  html += '<div class="skills-card strong"><h5>Strong</h5><ul>';
  (skills.strong || []).forEach(s => { html += `<li>${escapeHtml(s)}</li>`; });
  html += '</ul></div>';

  html += '<div class="skills-card developing"><h5>Developing</h5><ul>';
  (skills.developing || []).forEach(s => { html += `<li>${escapeHtml(s)}</li>`; });
  html += '</ul></div>';

  html += '<div class="skills-card missing"><h5>Missing</h5><ul>';
  (skills.missing || []).forEach(s => { html += `<li>${escapeHtml(s)}</li>`; });
  html += '</ul></div>';

  html += '</div>';

  if (skills.priorityToLearn && skills.priorityToLearn.length > 0) {
    html += '<div class="skills-priority"><h4>Priority to Learn</h4><ul>';
    skills.priorityToLearn.forEach(s => {
      html += `<li>${escapeHtml(s)}</li>`;
    });
    html += '</ul></div>';
  }

  if (skills.learningPlan) {
    html += `<div class="learning-plan"><h4>30-Day Learning Plan</h4><p>${escapeHtml(skills.learningPlan)}</p></div>`;
  }

  return html;
}

function renderRedFlagsTab(data) {
  const flags = data.redFlags || [];
  if (flags.length === 0) return '<p>No red flags detected in this job description.</p>';

  let html = '<ul class="red-flags-list">';
  flags.forEach(flag => {
    html += `<li class="red-flag-item">${escapeHtml(flag)}</li>`;
  });
  html += '</ul>';
  return html;
}

function renderSalaryTab(data) {
  const salary = data.salaryNegotiation || {};

  let html = '<div class="salary-container">';

  html += `<div class="salary-range-box">
    <h4>Estimated Range</h4>
    <div class="salary-range">${escapeHtml(salary.estimatedRange || 'N/A')}</div>
  </div>`;

  if (salary.anchorNumber) {
    html += `<div class="salary-anchor"><h4>Anchor Number</h4><p>${escapeHtml(salary.anchorNumber)}</p></div>`;
  }

  if (salary.talkingPoints && salary.talkingPoints.length > 0) {
    html += '<div class="talking-points"><h4>Talking Points</h4><ul>';
    salary.talkingPoints.forEach(tp => {
      html += `<li>${escapeHtml(tp)}</li>`;
    });
    html += '</ul></div>';
  }

  if (salary.negotiationScript) {
    html += `<div class="negotiation-script"><h4>Negotiation Script</h4><p>${escapeHtml(salary.negotiationScript)}</p></div>`;
  }

  html += '</div>';
  return html;
}

function renderPlanTab(data) {
  const plan = data.plan306090 || {};

  let html = '<div class="plan-grid">';

  const phases = [
    { key: 'days30', label: '30 Days', defaultTheme: 'Learn & Observe' },
    { key: 'days60', label: '60 Days', defaultTheme: 'Contribute & Connect' },
    { key: 'days90', label: '90 Days', defaultTheme: 'Lead & Deliver' },
  ];

  phases.forEach(phase => {
    const p = plan[phase.key] || {};
    html += `<div class="plan-card">
      <h4>${phase.label}</h4>
      <div class="plan-theme">${escapeHtml(p.theme || phase.defaultTheme)}</div>
      <ol>
        ${(p.goals || []).map(g => `<li>${escapeHtml(g)}</li>`).join('')}
      </ol>
    </div>`;
  });

  html += '</div>';
  return html;
}

function renderCultureTab(data) {
  const culture = data.cultureFit || {};

  let html = '<div class="culture-container">';

  html += `<div class="culture-score">
    <div>
      <div class="culture-score-value">${culture.score || 0}</div>
      <div class="culture-score-label">Culture Fit Score</div>
    </div>
  </div>`;

  if (culture.signals && culture.signals.length > 0) {
    html += '<div class="culture-section"><h4>Culture Signals</h4><ul>';
    culture.signals.forEach(s => { html += `<li>${escapeHtml(s)}</li>`; });
    html += '</ul></div>';
  }

  if (culture.fitAreas && culture.fitAreas.length > 0) {
    html += '<div class="culture-section"><h4>Your Fit Areas</h4><ul>';
    culture.fitAreas.forEach(s => { html += `<li>${escapeHtml(s)}</li>`; });
    html += '</ul></div>';
  }

  if (culture.watchOutFor && culture.watchOutFor.length > 0) {
    html += '<div class="culture-section"><h4>Watch Out For</h4><ul>';
    culture.watchOutFor.map(s => `<li>${escapeHtml(s)}</li>`).join('');
    html += '</ul></div>';
  }

  if (culture.questionsToAsk && culture.questionsToAsk.length > 0) {
    html += '<div class="culture-section"><h4>Questions to Ask</h4><ul>';
    culture.questionsToAsk.forEach(s => { html += `<li>${escapeHtml(s)}</li>`; });
    html += '</ul></div>';
  }

  html += '</div>';
  return html;
}

function renderReadinessTab(data) {
  const readiness = data.overallReadiness || {};

  let html = '<div class="readiness-container">';

  html += `<div class="readiness-score">${readiness.score || 0}</div>`;

  if (readiness.verdict) {
    html += `<div class="readiness-verdict">${escapeHtml(readiness.verdict)}</div>`;
  }

  if (readiness.strengthSummary) {
    html += `<div class="readiness-strength">
      <h4>Your Competitive Edge</h4>
      <p>${escapeHtml(readiness.strengthSummary)}</p>
    </div>`;
  }

  if (readiness.topPriorityAction) {
    html += `<div class="readiness-action">
      <h4>Top Priority Action</h4>
      <p>${escapeHtml(readiness.topPriorityAction)}</p>
    </div>`;
  }

  html += '</div>';
  return html;
}

// ============================================
// LOCKED SECTION
// ============================================

function renderLockedSection(featureId, title, description) {
  const fakeTexts = {
    'linkedin-summary': [
      'Results-driven professional with 7+ years driving product growth...',
      'Specialized in translating complex data into strategic decisions...'
    ],
    'skills-gap': [
      'Strong: Leadership, Data Analysis | Gap: Python, Machine Learning...',
      'Priority: Complete the AWS certification within 30 days...'
    ],
    'red-flags': [
      'Vague compensation language detected in listing...',
      'Unusually broad responsibility scope may indicate...'
    ],
    'salary-negotiation': [
      'Estimated range: $95,000 - $125,000 based on role level...',
      'Open with $115,000 based on your 5 years of experience...'
    ],
    '30-60-90-plan': [
      'Days 1-30: Complete onboarding, meet all stakeholders...',
      'Days 31-60: Identify quick wins, build cross-functional...'
    ],
    'culture-fit': [
      'Fast-paced startup environment with high autonomy...',
      'Collaborative culture with emphasis on async communication...'
    ],
    'overall-readiness': [
      'Score: 78/100 - Strong candidate with minor gaps in...',
      'Priority: Brush up on system design before interviews...'
    ],
  };

  const texts = fakeTexts[featureId] || fakeTexts['linkedin-summary'];

  return `
    <div class="locked-section" data-feature="${featureId}">
      <div class="locked-blur-content">
        <p>${texts[0]}</p>
        <p>${texts[1]}</p>
      </div>
      <div class="locked-overlay">
        <span class="lock-icon" aria-hidden="true">&#128274;</span>
        <h4 class="locked-title">${escapeHtml(title)}</h4>
        <p class="locked-desc">${escapeHtml(description)}</p>
        <button class="btn-unlock" onclick="openUpgradeModal()">Upgrade to Pro &mdash; $6/mo &rarr;</button>
      </div>
    </div>
  `;
}

// ============================================
// ATS RING SVG
// ============================================

function renderAtsRing(score) {
  const r = 54;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = score >= 75 ? '#2A5C40' : score >= 50 ? '#C8A84B' : '#C0392B';
  const grade = score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 70 ? 'C' : score >= 60 ? 'D' : 'F';
  return `
    <svg width="160" height="160" viewBox="0 0 140 140" role="img" aria-label="ATS score: ${score} out of 100">
      <circle cx="70" cy="70" r="${r}" fill="none" stroke="#E8E3DB" stroke-width="14"/>
      <circle cx="70" cy="70" r="${r}" fill="none" stroke="${color}" stroke-width="14"
        stroke-dasharray="${circ}" stroke-dashoffset="${offset}"
        stroke-linecap="round" transform="rotate(-90 70 70)"
        style="transition:stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1)"/>
      <text x="70" y="62" text-anchor="middle" font-family="Fraunces,serif" font-size="30" fill="#0F1A14" font-weight="900">${score}</text>
      <text x="70" y="80" text-anchor="middle" font-family="Fraunces,serif" font-size="16" fill="${color}" font-weight="700">Grade ${grade}</text>
      <text x="70" y="96" text-anchor="middle" font-family="Plus Jakarta Sans,sans-serif" font-size="10" fill="#5C7065">ATS Score</text>
    </svg>`;
}

// ============================================
// TAB SWITCHING
// ============================================

function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
    btn.setAttribute('aria-selected', 'false');
  });
  document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));

  const targetBtn = document.querySelector(`[data-tab="${tabName}"]`);
  if (targetBtn) {
    targetBtn.classList.add('active');
    targetBtn.setAttribute('aria-selected', 'true');
  }

  const targetPanel = document.getElementById(`panel-${tabName}`);
  if (targetPanel) targetPanel.classList.add('active');
}

// ============================================
// EMAIL REGISTRATION
// ============================================

async function submitEmail() {
  const email = document.getElementById('email-input').value.trim();
  if (!email || !email.includes('@')) {
    alert('Please enter a valid email address.');
    return;
  }
  const btn = document.getElementById('email-submit-btn');
  btn.textContent = 'Saving...';
  btn.disabled = true;

  const fingerprint = getOrCreateFingerprint();
  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, fingerprint })
    });
    const json = await res.json();
    if (res.ok) {
      localStorage.setItem('jt_token', json.token);
      localStorage.setItem('jt_tier', 'email');
      closeEmailModal();
      updateUsageDisplay(json.usesLeft);
      // Auto-submit the form now that they have email access
      submitForm();
    } else {
      throw new Error(json.error || 'Registration failed');
    }
  } catch (err) {
    alert(err.message);
    btn.textContent = 'Get my free uses \u2192';
    btn.disabled = false;
  }
}

// ============================================
// CHARACTER COUNTER
// ============================================

function attachCharCounter(textareaId, counterId, min = 50) {
  const ta = document.getElementById(textareaId);
  const counter = document.getElementById(counterId);
  if (!ta || !counter) return;

  ta.addEventListener('input', () => {
    const len = ta.value.length;
    counter.textContent = len < min ? `${min - len} more characters needed` : `${len} characters`;
    counter.style.color = len < min ? 'var(--danger)' : 'var(--muted)';
  });
}

// ============================================
// LOADING STATE
// ============================================

function setLoadingState(loading) {
  const btn = document.getElementById('submit-btn');
  const btnText = btn.querySelector('.btn-text');
  const spinner = btn.querySelector('.spinner');

  if (loading) {
    btn.disabled = true;
    btnText.textContent = 'Generating your tailored kit...';
    spinner.hidden = false;
  } else {
    btn.disabled = false;
    btnText.textContent = 'Generate My Tailored Kit \u2192';
    spinner.hidden = true;
  }
}

// ============================================
// ERROR HANDLING
// ============================================

function showError(message) {
  const el = document.getElementById('error-message');
  el.textContent = message;
  el.hidden = false;
}

function clearError() {
  const el = document.getElementById('error-message');
  el.textContent = '';
  el.hidden = true;
}

// ============================================
// USAGE DISPLAY
// ============================================

function updateUsageDisplay(usesLeft) {
  const el = document.getElementById('usage-display');
  if (!el) return;

  const tier = localStorage.getItem('jt_tier') || 'anon';

  if (tier === 'pro') {
    el.textContent = '\u2713 Pro \u2014 Unlimited uses';
    el.style.color = 'var(--gold)';
  } else if (usesLeft === Infinity) {
    el.textContent = '';
  } else if (usesLeft > 0) {
    el.textContent = `${usesLeft} free use${usesLeft !== 1 ? 's' : ''} remaining`;
    el.style.color = 'rgba(245,240,232,0.6)';
  } else {
    el.textContent = 'No uses remaining \u2014 Upgrade to Pro';
    el.style.color = 'var(--gold)';
  }
}

// ============================================
// MODALS
// ============================================

function openEmailModal() {
  document.getElementById('email-modal').hidden = false;
  document.body.style.overflow = 'hidden';
  setTimeout(() => document.getElementById('email-input')?.focus(), 100);
}

function closeEmailModal() {
  document.getElementById('email-modal').hidden = true;
  document.body.style.overflow = '';
}

function openUpgradeModal() {
  document.getElementById('upgrade-modal').hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeUpgradeModal() {
  document.getElementById('upgrade-modal').hidden = true;
  document.body.style.overflow = '';
}

// ============================================
// UTILITIES
// ============================================

function escapeHtml(text) {
  if (typeof text !== 'string') return String(text || '');
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
