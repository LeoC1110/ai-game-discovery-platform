// packages/auth-service/services/aiEvaluationService.js
// Rule-based evaluation of AI responses — no extra LLM call needed.
//
// Checks:
//   1. Grounding     — does the answer reference real platform game titles?
//   2. Hallucination — does the answer mention titles that don't exist in the DB?
//   3. Safety        — does the answer contain dangerous or off-topic content?
//   4. Post validity — do recommended posts have required fields and DB matches?

// ── 1. Grounding ──────────────────────────────────────────────────────────────
// Returns a 0–1 score: proportion of known titles that appear in the answer.
// Capped at 1.0 so mentioning every single title doesn't push it past full score.
export function evaluateGrounding(answer, knownTitles) {
  if (!knownTitles.length) return { score: null, matchedTitles: [] };

  const matched = knownTitles.filter((title) => {
    const re = new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    return re.test(answer);
  });

  // Score: matched / 30 % of known titles (so mentioning a few relevant ones = good score)
  const threshold = Math.max(1, Math.ceil(knownTitles.length * 0.3));
  return {
    score: Math.min(1, matched.length / threshold),
    matchedTitles: matched,
  };
}

// ── 2. Hallucination detection ────────────────────────────────────────────────
// Extracts **Bold** and "Quoted" candidates from the answer,
// then flags any that aren't in the known DB titles.
export function detectHallucinations(answer, knownTitles) {
  const candidates = new Set();

  // Match **Bold Text**, *Italic Text*, and "Quoted Text"
  const boldRe   = /\*\*([^*]{3,80})\*\*/g;
  const italicRe = /(?<!\*)\*([^*\n]{3,80})\*(?!\*)/g;
  const quoteRe  = /"([^"]{3,80})"/g;

  for (const re of [boldRe, italicRe, quoteRe]) {
    let m;
    while ((m = re.exec(answer)) !== null) {
      candidates.add(m[1].trim());
    }
  }

  const knownSet = new Set(knownTitles.map((t) => t.toLowerCase()));
  return [...candidates].filter((c) => !knownSet.has(c.toLowerCase()));
}

// ── 3. Safety ─────────────────────────────────────────────────────────────────
// Flags answers that contain dangerous instructions or clearly off-topic content.
const UNSAFE_PATTERNS = [
  { re: /how to (hack|crack|exploit)/i,            label: 'hacking instructions' },
  { re: /make (a bomb|a weapon|malware|a virus)/i, label: 'dangerous content' },
  { re: /\b(kill|murder|harm)\s+(someone|a person|people)\b/i, label: 'violent content' },
  { re: /personal (address|phone number|credit card)/i, label: 'PII request' },
];

const OFF_TOPIC_PATTERNS = [
  { re: /\b(stock market|crypto|bitcoin|nft|investment)\b/i, label: 'financial advice' },
  { re: /\b(medical advice|diagnos[ei]|prescri[bp])\b/i,      label: 'medical advice' },
  { re: /\b(politics|election|president|government policy)\b/i, label: 'political content' },
];

export function evaluateSafety(answer) {
  const unsafeFlags = UNSAFE_PATTERNS
    .filter(({ re }) => re.test(answer))
    .map(({ label }) => `unsafe: ${label}`);

  const offTopicFlags = OFF_TOPIC_PATTERNS
    .filter(({ re }) => re.test(answer))
    .map(({ label }) => `off-topic: ${label}`);

  return {
    passed: unsafeFlags.length === 0,
    flags: [...unsafeFlags, ...offTopicFlags],
  };
}

// ── 4. Recommended posts validity ─────────────────────────────────────────────
// Checks that each recommended post has a title and was matched to a real DB record.
export function evaluateRecommendedPosts(posts) {
  if (!Array.isArray(posts) || !posts.length) return { valid: true, flags: [] };

  const flags = [];
  posts.forEach((p, i) => {
    if (!p.title) flags.push(`recommendedPosts[${i}]: missing title`);
    if (!p.id)    flags.push(`recommendedPosts[${i}] "${p.title}": no matching DB record`);
  });

  return { valid: flags.length === 0, flags };
}

// ── Master evaluator ──────────────────────────────────────────────────────────
// Call this after getting the AI answer. Returns a structured evaluation object.
export function evaluateAIResponse({ answer, recommendedPosts = [], knownTitles = [] }) {
  const grounding   = evaluateGrounding(answer, knownTitles);
  const hallucinations = detectHallucinations(answer, knownTitles);
  const safety      = evaluateSafety(answer);
  const postsCheck  = evaluateRecommendedPosts(recommendedPosts);

  const flags = [
    ...(hallucinations.length
      ? [`possible hallucinations: ${hallucinations.join(', ')}`]
      : []),
    ...safety.flags,
    ...postsCheck.flags,
  ];

  const result = {
    groundingScore:        grounding.score,
    matchedTitles:         grounding.matchedTitles,
    hallucinations,
    safetyPassed:          safety.passed,
    recommendedPostsValid: postsCheck.valid,
    flags,
  };

  // Always log a compact summary — never log the full answer text (privacy)
  console.log(
    '[AI:eval] grounding:', grounding.score != null ? grounding.score.toFixed(2) : 'n/a',
    '| hallucinations:', hallucinations.length,
    '| safety:', safety.passed ? 'OK' : 'FAIL',
    '| postFlags:', postsCheck.flags.length,
    '| totalFlags:', flags.length,
  );

  if (flags.length) {
    console.warn('[AI:eval] flags:', flags);
  }

  return result;
}
