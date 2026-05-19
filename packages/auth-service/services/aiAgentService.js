// packages/auth-service/services/aiAgentService.js
// LangChain + Google Gemini — AI Game Agent backend service
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HumanMessage, AIMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import ConversationHistory from '../models/ConversationHistory.js';
import GamePost from '../models/GamePost.js';
import { buildFullSystemPrompt } from '../prompts/aiAgentSystemPrompt.js';
import { buildPlatformContext } from '../prompts/platformContextTemplate.js';
import { evaluateAIResponse } from './aiEvaluationService.js';
import { buildUserMemoryContext, saveExplicitPreferences } from './userMemoryService.js';
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

// ── Extract the <!--RECOMMENDATIONS:[...]-->  block from AI text ─────────────
// Returns { cleanAnswer, recommendations } where recommendations is the parsed
// array augmented with DB data (id, rating, tags, likesCount, commentsCount).
const RECO_BLOCK_RE = /<!--RECOMMENDATIONS:(\[.*?\])-->/s;

async function extractRecommendedPosts(aiText) {
  const match = RECO_BLOCK_RE.exec(aiText);
  if (!match) return { cleanAnswer: aiText, recommendations: [] };

  // Strip the block from the visible answer
  const cleanAnswer = aiText.replace(RECO_BLOCK_RE, '').trimEnd();

  let parsed;
  try {
    parsed = JSON.parse(match[1]);
    if (!Array.isArray(parsed)) return { cleanAnswer, recommendations: [] };
  } catch {
    return { cleanAnswer, recommendations: [] };
  }

  // Enrich each entry with real DB data
  try {
    const posts = await GamePost.find().lean();
    const postMap = new Map(posts.map((p) => [p.title.toLowerCase(), p]));

    const recommendations = parsed.slice(0, 5).map((item) => {
      const dbPost = postMap.get((item.title ?? '').toLowerCase());
      return {
        id: dbPost ? dbPost._id.toString() : null,
        title: item.title ?? null,
        rating: dbPost?.rating ?? null,
        tags: dbPost?.tags ?? [],
        likesCount: dbPost?.likedBy?.length ?? 0,
        commentsCount: dbPost?.comments?.length ?? 0,
        reason: item.reason ?? null,
        confidence: typeof item.confidence === 'number' ? item.confidence : null,
        matchedTags: Array.isArray(item.matchedTags) ? item.matchedTags : [],
      };
    // Plan C: remove any entry whose title has no matching DB record — prevents
    // hallucinated game titles from reaching the client.
    }).filter((item) => item.id !== null);

    return { cleanAnswer, recommendations };
  } catch {
    return { cleanAnswer, recommendations: [] };
  }
}

// ── Format a post for tool output (compact text for the AI) ───────────────────
function formatToolPost(p) {
  return (
    `• "${p.title}"` +
    (p.genre ? ` [${p.genre}]` : '') +
    (p.rating != null ? ` — ${p.rating}/10` : '') +
    (p.tags?.length ? ` tags: ${p.tags.slice(0, 4).join(', ')}` : '') +
    (p.likedBy?.length ? ` ♥${p.likedBy.length}` : '')
  );
}

// ── Tool factory — creates per-request tools with userId in closure ────────────
function createTools(userId) {
  const getMyBookmarks = tool(
    async () => {
      const posts = await GamePost.find({ bookmarkedBy: userId })
        .limit(10)
        .select('title genre platform rating tags likedBy')
        .lean();
      if (!posts.length) return 'The user has no bookmarked games yet.';
      return `User bookmarks (${posts.length}):\n` + posts.map(formatToolPost).join('\n');
    },
    {
      name: 'get_my_bookmarks',
      description:
        "Fetch the current user's bookmarked games to understand their taste profile. " +
        'After calling this tool, identify the common genres and tags across the bookmarks, ' +
        'then recommend DIFFERENT games from the platform data that share those patterns. ' +
        'Do NOT simply re-list the bookmarked games as recommendations.',
      schema: z.object({}),
    },
  );

  const getPopularGames = tool(
    async ({ limit = 10 }) => {
      const posts = await GamePost.find()
        .sort({ 'likedBy.length': -1, rating: -1 })
        .limit(limit)
        .select('title genre platform rating tags likedBy')
        .lean();
      // sort in JS since MongoDB can't sort by array length without aggregation
      posts.sort((a, b) => (b.likedBy?.length ?? 0) - (a.likedBy?.length ?? 0));
      if (!posts.length) return 'No games found in the community yet.';
      return `Popular games (top ${posts.length}):\n` + posts.map(formatToolPost).join('\n');
    },
    {
      name: 'get_popular_games',
      description: 'Fetch the most-liked / highest-rated games in the community.',
      schema: z.object({
        limit: z.number().int().min(1).max(20).optional().describe('Max results, default 10'),
      }),
    },
  );

  const searchGamesByTag = tool(
    async ({ tag }) => {
      const posts = await GamePost.find({ tags: { $regex: tag, $options: 'i' } })
        .limit(10)
        .select('title genre platform rating tags likedBy')
        .lean();
      if (!posts.length) return `No games found with tag matching "${tag}".`;
      return `Games matching tag "${tag}" (${posts.length}):\n` + posts.map(formatToolPost).join('\n');
    },
    {
      name: 'search_games_by_tag',
      description: 'Search community games by a tag, genre, or keyword (e.g. "rpg", "indie", "co-op").',
      schema: z.object({
        tag: z.string().describe('The tag or keyword to search for'),
      }),
    },
  );

  // ── Tool 4: user activity stats ──────────────────────────────────────────
  const getUserStats = tool(
    async () => {
      const [postsCount, bookmarksCount, likedCount] = await Promise.all([
        GamePost.countDocuments({ user: userId }),
        GamePost.countDocuments({ bookmarkedBy: userId }),
        GamePost.countDocuments({ likedBy: userId }),
      ]);
      return (
        `User activity on this platform: ` +
        `${postsCount} post(s) created, ` +
        `${bookmarksCount} game(s) bookmarked, ` +
        `${likedCount} post(s) liked.`
      );
    },
    {
      name: 'get_user_stats',
      description:
        "Get the current user's activity statistics (posts created, bookmarks, liked games). " +
        'Use this for personalised greetings, activity summaries, or when the user asks how active they are.',
      schema: z.object({}),
    },
  );

  return [getMyBookmarks, getPopularGames, searchGamesByTag, getUserStats];
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

  // 2. Load platform context + user memory in parallel
  let platformContext = '';
  let userMemoryContext = '';

  console.time('[AI] load context');
  await Promise.all([
    // Platform context (disable via AI_ENABLE_PLATFORM_CONTEXT=false)
    AI_ENABLE_PLATFORM_CONTEXT
      ? buildPlatformContext(userId)
          .then((ctx) => { platformContext = ctx; })
          .catch((err) => { logAIError('buildPlatformContext', err); })
      : Promise.resolve(),

    // User memory: long-term preferences + behavioral inference
    buildUserMemoryContext(userId)
      .then((ctx) => { userMemoryContext = ctx; })
      .catch((err) => { logAIError('buildUserMemoryContext', err); }),

    // Detect and save explicit preferences from this message (fire-and-forget)
    saveExplicitPreferences(userId, message).catch(() => {}),
  ]);
  console.timeEnd('[AI] load context');

  // 3. Build LangChain messages
  console.time('[AI] build prompt');
  const systemPrompt = buildFullSystemPrompt(platformContext, userMemoryContext);
  const langchainMessages = [new SystemMessage(systemPrompt)];
  for (const msg of historyRecords) {
    langchainMessages.push(
      msg.role === 'user' ? new HumanMessage(msg.content) : new AIMessage(msg.content),
    );
  }
  langchainMessages.push(new HumanMessage(message));
  console.timeEnd('[AI] build prompt');

  // 4. Run agentic loop — AI can call tools up to MAX_TOOL_ITERATIONS times
  console.time('[AI] gemini call');
  const tools = createTools(userId);
  const modelWithTools = model.bindTools(tools);
  const toolMap = Object.fromEntries(tools.map((t) => [t.name, t]));
  const MAX_TOOL_ITERATIONS = 5;

  let answer;
  let iteration = 0;
  try {
    while (iteration < MAX_TOOL_ITERATIONS) {
      const response = await withTimeout(modelWithTools.invoke(langchainMessages), AI_TIMEOUT_MS);
      langchainMessages.push(response);

      // No tool calls → final answer
      if (!response.tool_calls || response.tool_calls.length === 0) {
        answer = typeof response.content === 'string'
          ? response.content
          : response.content.map((c) => (typeof c === 'string' ? c : c.text ?? '')).join('');
        break;
      }

      // Execute each tool call and feed results back
      console.log('[AI] tool calls:', response.tool_calls.map((tc) => tc.name).join(', '));
      for (const tc of response.tool_calls) {
        const toolFn = toolMap[tc.name];
        let toolResult;
        try {
          toolResult = toolFn ? await toolFn.invoke(tc.args) : `Unknown tool: ${tc.name}`;
        } catch (toolErr) {
          toolResult = `Tool error: ${toolErr?.message ?? 'unknown'}`;
        }
        console.log(`[AI]   ${tc.name} →`, String(toolResult).slice(0, 120));
        langchainMessages.push(new ToolMessage({ content: String(toolResult), tool_call_id: tc.id }));
      }
      iteration++;
    }

    // Safety fallback if we exhausted iterations without a text answer
    if (!answer) {
      answer = GENERIC_ERROR_RESPONSE;
    }
  } catch (err) {
    console.timeEnd('[AI] gemini call');
    console.timeEnd('[AI] askAI total');
    if (err.isTimeout) {
      console.warn('[AI] Gemini call timed out after', AI_TIMEOUT_MS, 'ms');
      throw err;
    }
    logAIError('model.invoke', err);
    _model = null;
    throw new Error(GENERIC_ERROR_RESPONSE);
  }
  console.timeEnd('[AI] gemini call');

  // 5. Extract structured recommendations + fetch known titles for evaluation
  console.time('[AI] save + extract');
  let { cleanAnswer, recommendations } = await extractRecommendedPosts(answer);
  const allPosts = await GamePost.find().select('title').lean();
  const knownTitles = allPosts.map((p) => p.title);
  console.timeEnd('[AI] save + extract');

  // 6. First evaluation pass
  let evaluation = evaluateAIResponse({ answer: cleanAnswer, recommendedPosts: recommendations, knownTitles });

  // 7. Planning — Reflection pass
  // If evaluation found hallucinations or safety issues, ask Gemini to revise its own answer.
  // Uses a minimal context (system + user message + bad answer) — no tools this round.
  // At most ONE reflection to avoid runaway API calls.
  const needsReflection = evaluation.hallucinations.length > 0 || !evaluation.safetyPassed;
  let wasReflected = false;

  if (needsReflection) {
    console.warn('[AI:reflect] Issues detected — starting reflection pass. Flags:', evaluation.flags);
    try {
      const flagList = evaluation.flags.map((f) => `- ${f}`).join('\n');
      const reflectionMessages = [
        new SystemMessage(systemPrompt),
        new HumanMessage(message),
        new AIMessage(cleanAnswer),
        new HumanMessage(
          `Your previous response was automatically checked and the following issues were found:\n` +
          `${flagList}\n\n` +
          `Please provide a revised response that:\n` +
          `• Only references game titles that exist in the platform data\n` +
          `• Is safe and appropriate\n` +
          `• Stays grounded in the provided context`,
        ),
      ];
      console.time('[AI] reflection call');
      const reflected = await withTimeout(model.invoke(reflectionMessages), AI_TIMEOUT_MS);
      console.timeEnd('[AI] reflection call');
      const reflectedText =
        typeof reflected.content === 'string'
          ? reflected.content
          : reflected.content.map((c) => (typeof c === 'string' ? c : c.text ?? '')).join('');
      if (reflectedText) {
        const re = await extractRecommendedPosts(reflectedText);
        cleanAnswer = re.cleanAnswer;
        recommendations = re.recommendations;
        evaluation = evaluateAIResponse({ answer: cleanAnswer, recommendedPosts: recommendations, knownTitles });
        wasReflected = true;
        console.log('[AI:reflect] Reflection complete. Remaining flags:', evaluation.flags.length);
      }
    } catch (err) {
      console.warn('[AI:reflect] Reflection pass failed — using original answer:', err?.message);
    }
  } else if (evaluation.hallucinations?.length) {
    // Hallucinations found in text but not in RECOMMENDATIONS block — log only
    console.warn('[AI:hallucination] Hallucinations in answer text:', evaluation.hallucinations.join(', '));
  }

  // 8. Save final (possibly reflected) answer to history
  await saveExchange(userId, username, message, cleanAnswer);

  evaluation.wasReflected = wasReflected;

  console.timeEnd('[AI] askAI total');
  return { answer: cleanAnswer, recommendedPosts: recommendations, evaluation };
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

