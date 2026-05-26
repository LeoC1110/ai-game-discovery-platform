// packages/auth-service/services/aiAgentService.js
// LangChain + Google Gemini — AI Game Agent backend service
// askAIAgent delegates to the modular pipeline in ../ai/aiPipeline.js
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HumanMessage } from '@langchain/core/messages';
import ConversationHistory from '../models/ConversationHistory.js';
import { TIMEOUT_RESPONSE } from '../prompts/fallbackResponses.js';
import { runPipeline } from '../ai/aiPipeline.js';

// ── Config ────────────────────────────────────────────────────────────────────
const AI_TIMEOUT_MS = parseInt(process.env.AI_TIMEOUT_MS ?? '30000', 10);
const AI_MAX_HISTORY_MESSAGES = parseInt(process.env.AI_MAX_HISTORY_MESSAGES ?? '3', 10);

// ── Safe error logger (never logs API key or user PII) ────────────────────────
function logAIError(step, err) {
  console.error('[AI] Error at step:', step);
  console.error('[AI]   error.name   :', err?.name ?? 'unknown');
  console.error('[AI]   error.message:', err?.message ?? 'no message');
  if (err?.status != null)  console.error('[AI]   error.status :', err.status);
  if (err?.code != null)    console.error('[AI]   error.code   :', err.code);
  if (err?.statusCode != null) console.error('[AI]   statusCode  :', err.statusCode);
  console.error('[AI]   model used   :', process.env.AI_MODEL ?? 'gemini-1.5-flash');
}

// ── Singleton Gemini model ────────────────────────────────────────────────────
// Re-created if null; never caches a bad key or wrong model.
let _model = null;

function getModel() {
  if (_model) return _model;
  const key = process.env.GOOGLE_API_KEY;
  if (!key || !key.trim()) {
    throw new Error('GOOGLE_API_KEY is missing in backend environment variables.');
  }
  const modelName = process.env.AI_MODEL ?? 'gemini-1.5-flash';
  console.log('[AI] Creating model instance:', modelName);
  _model = new ChatGoogleGenerativeAI({
    model: modelName,
    apiKey: key.trim(),
    maxOutputTokens: 512,
    maxRetries: 0, // disable retries so each user message = exactly one API call
  });
  return _model;
}


// ── Timeout wrapper ────────────────────────────────────────────────────────────
function withTimeout(promise, ms) {
  const timeoutErr = new Error(TIMEOUT_RESPONSE);
  timeoutErr.isTimeout = true;
  const timer = new Promise((_, reject) => setTimeout(() => reject(timeoutErr), ms));
  return Promise.race([promise, timer]);
}

// ── Minimal Gemini health test ─────────────────────────────────────────────────
// Sends one tiny message with zero context — no DB, no history, no posts.
// Use this to verify API key + model + SDK are all working.
export async function geminiHealthTest() {
  const key = process.env.GOOGLE_API_KEY;
  if (!key || !key.trim()) {
    return 'HEALTH CHECK FAILED: GOOGLE_API_KEY is missing in backend environment variables.';
  }
  const modelName = process.env.AI_MODEL ?? 'gemini-1.5-flash';
  console.log('[AI] Health test — model:', modelName);
  try {
    // Create a fresh model instance (not the singleton) so we can test independently
    const testModel = new ChatGoogleGenerativeAI({
      model: modelName,
      apiKey: key.trim(),
      maxOutputTokens: 64,
      maxRetries: 0,
    });
    const response = await withTimeout(
      testModel.invoke([new HumanMessage('Say hello in one sentence.')]),
      15000,
    );
    const text = typeof response.content === 'string'
      ? response.content
      : response.content.map((c) => (typeof c === 'string' ? c : c.text ?? '')).join('');
    console.log('[AI] Health test PASSED — response:', text.slice(0, 120));
    return `HEALTH CHECK PASSED (model: ${modelName}): ${text.trim()}`;
  } catch (err) {
    logAIError('geminiHealthTest', err);
    return `HEALTH CHECK FAILED (model: ${modelName}): ${err?.message ?? 'unknown error'}`;
  }
}

// ── Main export — delegates to the modular pipeline ────────────────────────────
export async function askAIAgent({ userId, username, message }) {
  return runPipeline({ userId, username, message });
}



// ── Clear a user's history ─────────────────────────────────────────────────────
export async function clearAIHistory(userId) {
  try {
    await ConversationHistory.findOneAndUpdate({ userId }, { $set: { messages: [] } });
    return true;
  } catch {
    return false;
  }
}

// ── Load a user's recent history (for frontend display) ───────────────────────
export async function getAIHistory(userId) {
  try {
    const record = await ConversationHistory.findOne({ userId }).lean();
    if (!record) return [];
    return record.messages.slice(-AI_MAX_HISTORY_MESSAGES);
  } catch {
    return [];
  }
}

// ── Optional warm-up — call once after server starts ──────────────────────────
export async function warmUpAIAgent() {
  if (process.env.AI_WARMUP_ON_START !== 'true') return;
  if (!process.env.GOOGLE_API_KEY) {
    console.log('🤖 AI warm-up skipped — GOOGLE_API_KEY not set');
    return;
  }
  try {
    const model = getModel();
    await withTimeout(model.invoke([new HumanMessage('Hello')]), 10000);
    console.log('🤖 AI warm-up completed');
  } catch (err) {
    logAIError('warmUpAIAgent', err);
    _model = null; // reset so next real call gets a fresh model
    console.log('🤖 AI warm-up failed — will initialize on first real request');
  }
}

