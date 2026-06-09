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
const AI_MESSAGE_MAX_LENGTH = 1000;
const isProduction = process.env.NODE_ENV === 'production';

function normalizeAIMessage(message) {
  const trimmed = (message || '').trim();
  if (!trimmed) {
    const err = new Error('Message cannot be empty. Please enter a message.');
    err.code = 'BAD_USER_INPUT';
    throw err;
  }
  if (trimmed.length > AI_MESSAGE_MAX_LENGTH) {
    const err = new Error(`Message is too long. Maximum length is ${AI_MESSAGE_MAX_LENGTH} characters.`);
    err.code = 'BAD_USER_INPUT';
    throw err;
  }
  return trimmed;
}

// ── Safe error logger (never logs API key or user PII) ────────────────────────
function logAIError(step, err) {
  console.error('[AI] Error at step:', step);
  console.error('[AI]   error.message:', err?.message ?? 'no message');
  if (!isProduction) {
    console.error('[AI]   error.name   :', err?.name ?? 'unknown');
    if (err?.status != null) console.error('[AI]   error.status :', err.status);
    if (err?.code != null) console.error('[AI]   error.code   :', err.code);
    if (err?.statusCode != null) console.error('[AI]   statusCode  :', err.statusCode);
    console.error('[AI]   model used   :', process.env.AI_MODEL ?? 'gemini-3.1-flash-lite');
  }
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
  const modelName = process.env.AI_MODEL ?? 'gemini-3.1-flash-lite';
  if (!isProduction) {
    console.log('[AI] Creating model instance:', modelName);
  }
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
  const modelName = process.env.AI_MODEL ?? 'gemini-3.1-flash-lite';
  if (!isProduction) {
    console.log('[AI] Health test — model:', modelName);
  }
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
    if (!isProduction) {
      console.log('[AI] Health test PASSED');
    }
    return `HEALTH CHECK PASSED (model: ${modelName}): ${text.trim()}`;
  } catch (err) {
    logAIError('geminiHealthTest', err);
    return `HEALTH CHECK FAILED (model: ${modelName}): ${err?.message ?? 'unknown error'}`;
  }
}

// ── Main export — delegates to the modular pipeline ────────────────────────────
export async function askAIAgent({ userId, username, message }) {
  const normalizedMessage = normalizeAIMessage(message);
  const metadata = {
    userId: String(userId),
    requestType: 'askAI',
    messageLength: normalizedMessage.length,
  };
  if (isProduction) {
    console.info('[AI] request received', metadata);
  } else {
    console.log('[AI] request received', metadata);
  }
  return runPipeline({ userId, username, message: normalizedMessage });
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
    if (!isProduction) {
      console.log('🤖 AI warm-up skipped — GOOGLE_API_KEY not set');
    }
    return;
  }
  try {
    const model = getModel();
    await withTimeout(model.invoke([new HumanMessage('Hello')]), 10000);
    if (!isProduction) {
      console.log('🤖 AI warm-up completed');
    }
  } catch (err) {
    logAIError('warmUpAIAgent', err);
    _model = null; // reset so next real call gets a fresh model
    console.warn('🤖 AI warm-up failed — will initialize on first real request');
  }
}

