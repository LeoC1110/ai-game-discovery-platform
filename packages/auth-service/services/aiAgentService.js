// packages/auth-service/services/aiAgentService.js
// LangChain + Google Gemini — AI Game Agent backend service
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import ConversationHistory from '../models/ConversationHistory.js';
import GamePost from '../models/GamePost.js';
import { buildFullSystemPrompt } from '../prompts/aiAgentSystemPrompt.js';
import { buildPlatformContext } from '../prompts/platformContextTemplate.js';
import {
  GREETING_RESPONSE,
  TIMEOUT_RESPONSE,
  GENERIC_ERROR_RESPONSE,
} from '../prompts/fallbackResponses.js';

// ── Config ────────────────────────────────────────────────────────────────────
// AI_MODEL read at call-time (inside getModel) so .env changes take effect after restart.
// Default: gemini-1.5-flash — widely available and fast.
const AI_TIMEOUT_MS = parseInt(process.env.AI_TIMEOUT_MS ?? '30000', 10);
// Limit history messages sent to Gemini (reduces token count while debugging)
const AI_MAX_HISTORY_MESSAGES = parseInt(process.env.AI_MAX_HISTORY_MESSAGES ?? '3', 10);
// Set AI_ENABLE_PLATFORM_CONTEXT=false in .env to disable heavy context loading for debugging
const AI_ENABLE_PLATFORM_CONTEXT = process.env.AI_ENABLE_PLATFORM_CONTEXT !== 'false';

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

// ── Simple greeting detector — skip Gemini entirely for trivial messages ───────
const SIMPLE_GREETING = /^\s*(hi|hello|hey|test|yo|sup|hiya|howdy|greetings|ping)[!?.,\s]*$/i;

function isSimpleGreeting(message) {
  return SIMPLE_GREETING.test(message);
}

// ── Load recent conversation history for a user ────────────────────────────────
async function loadHistory(userId) {
  try {
    const record = await ConversationHistory.findOne({ userId }).lean();
    if (!record) return [];
    return record.messages.slice(-AI_MAX_HISTORY_MESSAGES);
  } catch {
    return [];
  }
}

// ── Save a user+assistant exchange ────────────────────────────────────────────
async function saveExchange(userId, username, userMessage, aiResponse) {
  try {
    await ConversationHistory.findOneAndUpdate(
      { userId },
      {
        $setOnInsert: { userId, username },
        $push: {
          messages: {
            $each: [
              { role: 'user', content: userMessage, createdAt: new Date() },
              { role: 'assistant', content: aiResponse, createdAt: new Date() },
            ],
          },
        },
      },
      { upsert: true, new: true },
    );
  } catch {
    // saving failed — not fatal
  }
}

// ── Build recommended posts list from AI answer ────────────────────────────────
async function extractRecommendedPosts(aiText) {
  try {
    const posts = await GamePost.find().lean();
    const mentioned = posts
      .filter((p) => {
        const re = new RegExp(p.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        return re.test(aiText);
      })
      .slice(0, 5);
    return mentioned.map((p) => ({
      id: p._id.toString(),
      title: p.title,
      rating: p.rating ?? null,
      tags: p.tags ?? [],
      likesCount: p.likedBy?.length ?? 0,
      commentsCount: p.comments?.length ?? 0,
      reason: null,
    }));
  } catch {
    return [];
  }
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

// ── Main export ────────────────────────────────────────────────────────────────
export async function askAIAgent({ userId, username, message }) {
  console.time('[AI] askAI total');

  // ── Fast path: instant local response for greetings — no Gemini call ─────────
  if (isSimpleGreeting(message)) {
    console.log('[AI] greeting fast-path — skipping Gemini');
    console.timeEnd('[AI] askAI total');
    saveExchange(userId, username, message, GREETING_RESPONSE);
    return { answer: GREETING_RESPONSE, recommendedPosts: [] };
  }

  // ── Key check before any DB work ──────────────────────────────────────────────
  const key = process.env.GOOGLE_API_KEY;
  if (!key || !key.trim()) {
    console.timeEnd('[AI] askAI total');
    throw new Error('GOOGLE_API_KEY is missing in backend environment variables.');
  }

  const model = getModel();

  // 1. Load last N history messages (small N while debugging)
  console.time('[AI] load history');
  let historyRecords = [];
  try {
    historyRecords = await loadHistory(userId);
  } catch (err) {
    logAIError('loadHistory', err);
    // Non-fatal — continue without history
  }
  console.timeEnd('[AI] load history');

  // 2. Optionally load platform context (disable via AI_ENABLE_PLATFORM_CONTEXT=false)
  let platformContext = '';
  if (AI_ENABLE_PLATFORM_CONTEXT) {
    console.time('[AI] load platform context');
    try {
      platformContext = await buildPlatformContext(userId);
    } catch (err) {
      logAIError('buildPlatformContext', err);
      // Non-fatal — continue with empty context
    }
    console.timeEnd('[AI] load platform context');
  } else {
    console.log('[AI] platform context disabled (AI_ENABLE_PLATFORM_CONTEXT=false)');
  }

  // 3. Build LangChain messages
  console.time('[AI] build prompt');
  const systemPrompt = buildFullSystemPrompt(platformContext);
  const langchainMessages = [new SystemMessage(systemPrompt)];
  for (const msg of historyRecords) {
    langchainMessages.push(
      msg.role === 'user' ? new HumanMessage(msg.content) : new AIMessage(msg.content),
    );
  }
  langchainMessages.push(new HumanMessage(message));
  console.timeEnd('[AI] build prompt');

  // 4. Call Gemini with timeout — log real error safely before rethrowing
  console.time('[AI] gemini call');
  let answer;
  try {
    const response = await withTimeout(model.invoke(langchainMessages), AI_TIMEOUT_MS);
    answer = typeof response.content === 'string'
      ? response.content
      : response.content.map((c) => (typeof c === 'string' ? c : c.text ?? '')).join('');
  } catch (err) {
    console.timeEnd('[AI] gemini call');
    console.timeEnd('[AI] askAI total');
    if (err.isTimeout) {
      console.warn('[AI] Gemini call timed out after', AI_TIMEOUT_MS, 'ms');
      throw err; // message is already TIMEOUT_RESPONSE
    }
    // Log the real Gemini/LangChain error safely
    logAIError('model.invoke', err);
    // Reset singleton so next call creates a fresh model (avoids stuck bad state)
    _model = null;
    throw new Error(GENERIC_ERROR_RESPONSE);
  }
  console.timeEnd('[AI] gemini call');

  // 5. Save history + extract recommended posts in parallel
  console.time('[AI] save + extract');
  const [, recommendedPosts] = await Promise.all([
    saveExchange(userId, username, message, answer),
    extractRecommendedPosts(answer),
  ]);
  console.timeEnd('[AI] save + extract');

  console.timeEnd('[AI] askAI total');
  return { answer, recommendedPosts };
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

