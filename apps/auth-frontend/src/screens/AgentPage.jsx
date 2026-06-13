// src/screens/AgentPage.jsx — AI Game Agent (LangChain + Google Gemini)
import React, { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { useMutation, useQuery } from "@apollo/client";
import { useLocation } from "react-router-dom";
import DashboardNav from "../components/DashboardNav";
import PostRatingSummary from "../components/PostRatingSummary";
import { ASK_AI, CLEAR_AI_HISTORY, MY_AI_HISTORY } from "../gql/askAI";
import { streamNovaResponse } from "../services/aiStreamClient";

const SUGGESTIONS = [
  {
    label: "Browse games",
    description: "Explore available platform games.",
    prompt:
      "Browse platform games. Show the first 10 games available on the platform.",
  },
  {
    label: "Trending",
    description: "See what the community is playing.",
    prompt: "Show the top trending games in the community from platform data.",
  },
  {
    label: "Top rated",
    description: "Find the highest-rated community picks.",
    prompt: "Show the top-rated community games from platform data.",
  },
  {
    label: "Quick picks",
    description: "Get three simple platform-based suggestions.",
    prompt:
      "Recommend three games from the platform and explain why each one is worth trying.",
  },
  {
    label: "For me",
    description: "Find games based on your bookmarks and preferences.",
    prompt:
      "Recommend games for me based on my bookmarks, preferences, and taste profile.",
  },
  {
    label: "Trend picks",
    description: "Match community trends with your personal taste.",
    prompt:
      "Show trending community games, then recommend one that best matches my bookmarks and preferences.",
  },
  {
    label: "My taste",
    description: "Analyze your saved-game profile.",
    prompt: "Analyze my bookmarked games and summarize my taste profile.",
  },
  {
    label: "Low rated",
    description: "Explore mixed or lower-rated games.",
    prompt: "Show low-rated games on the platform from community data.",
  },
];

const PROGRESS_STEPS = {
  zh: {
    default: [
      "Nova 正在理解你的请求意图……",
      "Nova 正在匹配合适的任务流程……",
      "Nova 正在读取平台游戏与社区数据……",
      "Nova 正在生成基于数据的回复……",
      "Nova 正在检查回答是否可靠……",
    ],
    bookmark: [
      "Nova 正在分析你的收藏游戏……",
      "Nova 正在提取你的偏好与口味特征……",
      "Nova 正在匹配平台中的相关游戏……",
      "Nova 正在生成个性化推荐理由……",
      "Nova 正在检查推荐是否符合你的偏好……",
    ],
    community: [
      "Nova 正在读取当前社区活跃数据……",
      "Nova 正在比较评分、点赞、收藏与评论信号……",
      "Nova 正在筛选最相关的社区游戏……",
      "Nova 正在整理趋势与排名结论……",
      "Nova 正在检查回答是否基于平台数据……",
    ],
    action: [
      "Nova 正在识别你想执行的操作……",
      "Nova 正在确认相关游戏或目标内容……",
      "Nova 正在准备下一步操作说明……",
      "Nova 正在避免误报已完成的操作……",
      "Nova 正在整理最终回复……",
    ],
  },
  en: {
    default: [
      "Nova is understanding your request...",
      "Nova is matching the right task flow...",
      "Nova is loading platform games and community data...",
      "Nova is generating a grounded response...",
      "Nova is checking the answer for reliability...",
    ],
    bookmark: [
      "Nova is analyzing your bookmarked games...",
      "Nova is extracting your taste and preference signals...",
      "Nova is matching relevant games from the platform...",
      "Nova is generating personalized recommendation reasons...",
      "Nova is checking whether the recommendations fit your preferences...",
    ],
    community: [
      "Nova is reading current community activity...",
      "Nova is comparing ratings, likes, bookmarks, and comments...",
      "Nova is filtering the most relevant community games...",
      "Nova is organizing trend and ranking insights...",
      "Nova is checking that the answer is grounded in platform data...",
    ],
    action: [
      "Nova is identifying the action you want to take...",
      "Nova is confirming the related game or target content...",
      "Nova is preparing the next clear step...",
      "Nova is avoiding unsupported action-completion claims...",
      "Nova is finalizing the response...",
    ],
  },
};

function detectProgressLanguage(userText = "") {
  // English-first: only switch to Chinese when the input is clearly Chinese.
  const hasCjk = /[\u3400-\u9FFF\uF900-\uFAFF]/.test(userText);
  const hasEnglishWord = /[A-Za-z]{2,}/.test(userText);
  return hasCjk && !hasEnglishWord ? "zh" : "en";
}

function buildProgressSteps(userText = "") {
  const lang = detectProgressLanguage(userText);
  const copy = PROGRESS_STEPS[lang] ?? PROGRESS_STEPS.en;
  const text = userText.toLowerCase();
  const asksBookmark = /bookmark|bookmarks|收藏|已保存|saved/.test(text);
  const asksCommunity =
    /community|trending|leaderboard|top-rated|低分|热门|社区/.test(text);

  if (asksBookmark) {
    return copy.bookmark;
  }

  if (asksCommunity) {
    return copy.community;
  }

  return copy.default;
}

// ── Small recommendation card ──────────────────────────────────────────────────
function RecommendedCard({ post }) {
  return (
    <div className="agent-recommended-card">
      <p className="agent-recommended-card__title">{post.title}</p>
      {(post.authorRating != null ||
        post.communityRating != null ||
        post.rating != null) && (
        <div className="agent-recommended-card__rating">
          <PostRatingSummary
            authorRating={post.authorRating}
            communityRating={post.communityRating ?? post.rating}
            ratingCount={post.ratingCount}
            compact
          />
        </div>
      )}
      {post.tags?.length > 0 && (
        <p className="agent-recommended-card__tags">
          {post.tags.slice(0, 3).join(" · ")}
        </p>
      )}
      <p className="agent-recommended-card__stats">
        {post.likesCount != null && `♥ ${post.likesCount}`}
        {post.commentsCount != null && `  💬 ${post.commentsCount}`}
      </p>
      {post.reason && (
        <p className="agent-recommended-card__reason">{post.reason}</p>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function AgentPage() {
  const bottomRef = useRef(null);
  const streamAbortRef = useRef(null);
  const location = useLocation();
  const sessionVersionRef = useRef(0);
  const greetingMessage = {
    id: "greeting",
    role: "agent",
    text: "Hi, I’m Nova. I can help you find games you might enjoy, explore community trends, or recommend titles based on your bookmarks and preferences. What would you like to discover today?",
  };

  const toUiMessages = (history = []) =>
    history.map((m, idx) => ({
      id: `${m.createdAt || "no-date"}-${m.role}-${idx}`,
      role: m.role === "user" ? "user" : "agent",
      text: m.content,
    }));

  const hydrateHistoryWithRecommendations = (
    history = [],
    previousMessages = [],
  ) => {
    const recommendationMap = new Map(
      (previousMessages || [])
        .filter(
          (m) => m.role === "agent" && m.text && m.recommendedPosts?.length,
        )
        .map((m) => [m.text, m.recommendedPosts]),
    );

    return toUiMessages(history).map((m) => {
      if (m.role !== "agent") return m;
      const recos = recommendationMap.get(m.text);
      return recos ? { ...m, recommendedPosts: recos } : m;
    });
  };

  // Load previous conversation history on mount
  const {
    data: historyData,
    loading: historyLoading,
    refetch: refetchHistory,
  } = useQuery(MY_AI_HISTORY, {
    fetchPolicy: "cache-and-network",
  });

  const [messages, setMessages] = useState(null); // null = not yet initialised
  const [input, setInput] = useState(location.state?.prompt ?? "");
  const [progressSteps, setProgressSteps] = useState(PROGRESS_STEPS.en.default);
  const [progressStepIndex, setProgressStepIndex] = useState(0);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingProgress, setStreamingProgress] = useState("");

  // Initialise messages once history loads
  useEffect(() => {
    if (historyLoading || messages !== null) return;
    const history = historyData?.myAIHistory ?? [];
    const restored = toUiMessages(history);
    setMessages(restored.length ? restored : [greetingMessage]);
  }, [historyLoading, historyData, messages]);

  const [askAI, { loading: askingFallback }] = useMutation(ASK_AI);
  const [clearHistory] = useMutation(CLEAR_AI_HISTORY);
  const isThinking = isStreaming || askingFallback;

  const setMessagesForSession = (expectedVersion, updater) => {
    setMessages((prev) => {
      if (expectedVersion !== sessionVersionRef.current) return prev;
      return typeof updater === "function" ? updater(prev) : updater;
    });
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking, streamingProgress]);

  useEffect(
    () => () => {
      streamAbortRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    if (!isThinking) {
      setProgressStepIndex(0);
      return;
    }

    setProgressStepIndex(0);
    const timer = setInterval(() => {
      setProgressStepIndex((prev) =>
        Math.min(prev + 1, progressSteps.length - 1),
      );
    }, 1400);

    return () => clearInterval(timer);
  }, [isThinking, progressSteps]);

  const sendMessage = async (text) => {
    const userText = (text ?? input).trim();
    if (!userText || isThinking) return;
    const activeSessionVersion = sessionVersionRef.current;
    streamAbortRef.current?.abort();
    streamAbortRef.current = new AbortController();
    const messageTimestamp = Date.now();
    const assistantMessageId = `agent-${messageTimestamp}`;

    setProgressSteps(buildProgressSteps(userText));
    setProgressStepIndex(0);
    setStreamingProgress("");
    setIsStreaming(true);
    setInput("");
    setMessages((prev) => [
      ...(prev ?? []),
      { id: `user-${messageTimestamp}`, role: "user", text: userText },
      {
        id: assistantMessageId,
        role: "agent",
        text: "",
        recommendedPosts: [],
        isStreaming: true,
      },
    ]);

    let bufferedText = "";
    let finalPayload = null;

    try {
      await streamNovaResponse({
        message: userText,
        signal: streamAbortRef.current.signal,
        onProgress: (progressMessage) => {
          if (activeSessionVersion !== sessionVersionRef.current) return;
          setStreamingProgress(progressMessage || "");
        },
        onToken: (chunk) => {
          if (activeSessionVersion !== sessionVersionRef.current || !chunk)
            return;
          bufferedText += chunk;
          setMessagesForSession(activeSessionVersion, (prev) =>
            (prev ?? []).map((msg) =>
              msg.id === assistantMessageId
                ? { ...msg, text: bufferedText, isStreaming: true }
                : msg,
            ),
          );
        },
        onFinal: (payload) => {
          if (activeSessionVersion !== sessionVersionRef.current) return;
          finalPayload = payload ?? {};
          if (!bufferedText && typeof finalPayload.answer === "string") {
            bufferedText = finalPayload.answer;
            setMessagesForSession(activeSessionVersion, (prev) =>
              (prev ?? []).map((msg) =>
                msg.id === assistantMessageId
                  ? { ...msg, text: finalPayload.answer, isStreaming: true }
                  : msg,
              ),
            );
          }
        },
        onDone: (payload) => {
          if (activeSessionVersion !== sessionVersionRef.current) return;
          if (!finalPayload && payload && typeof payload === "object") {
            finalPayload = payload;
          }
        },
      });

      if (activeSessionVersion !== sessionVersionRef.current) return;
      const answer =
        (typeof finalPayload?.answer === "string" &&
          finalPayload.answer.trim()) ||
        bufferedText.trim() ||
        "No response generated.";
      const recommendedPosts = Array.isArray(finalPayload?.recommendedPosts)
        ? finalPayload.recommendedPosts
        : [];

      setMessagesForSession(activeSessionVersion, (prev) =>
        (prev ?? []).map((msg) =>
          msg.id === assistantMessageId
            ? {
                ...msg,
                text: answer,
                recommendedPosts: recommendedPosts ?? [],
                isStreaming: false,
              }
            : msg,
        ),
      );

      // Sync with canonical server history to avoid transient UI drift.
      const refreshed = await refetchHistory();
      if (activeSessionVersion !== sessionVersionRef.current) return;
      const latestHistory = refreshed?.data?.myAIHistory ?? [];
      if (latestHistory.length) {
        setMessagesForSession(activeSessionVersion, (prev) =>
          hydrateHistoryWithRecommendations(latestHistory, prev),
        );
      }
    } catch (streamErr) {
      if (activeSessionVersion !== sessionVersionRef.current) return;
      try {
        // Fallback to existing mutation API when SSE endpoint is unavailable.
        const { data } = await askAI({ variables: { message: userText } });
        if (activeSessionVersion !== sessionVersionRef.current) return;
        const { answer, recommendedPosts } = data.askAI;
        setMessagesForSession(activeSessionVersion, (prev) =>
          (prev ?? []).map((msg) =>
            msg.id === assistantMessageId
              ? {
                  ...msg,
                  text: answer,
                  recommendedPosts: recommendedPosts ?? [],
                  isStreaming: false,
                }
              : msg,
          ),
        );
      } catch (fallbackErr) {
        if (activeSessionVersion !== sessionVersionRef.current) return;
        const errMsg =
          fallbackErr?.graphQLErrors?.[0]?.message ??
          streamErr?.message ??
          "Something went wrong. Please check that GOOGLE_API_KEY is configured on the server.";
        setMessagesForSession(activeSessionVersion, (prev) =>
          (prev ?? []).map((msg) =>
            msg.id === assistantMessageId
              ? {
                  ...msg,
                  text: `⚠️ ${errMsg}`,
                  isError: true,
                  isStreaming: false,
                }
              : msg,
          ),
        );
      }
    } finally {
      if (activeSessionVersion === sessionVersionRef.current) {
        setStreamingProgress("");
        setIsStreaming(false);
      }
    }
  };

  const handleClear = async () => {
    sessionVersionRef.current += 1;
    streamAbortRef.current?.abort();
    setIsStreaming(false);
    setStreamingProgress("");
    setMessages([greetingMessage]);
    setInput("");

    clearHistory({
      update(cache) {
        cache.modify({
          id: "ROOT_QUERY",
          fields: {
            myAIHistory() {
              return [];
            },
          },
        });
      },
    }).catch(() => {
      // Keep UI reset even if the backend clear operation fails.
    });
  };

  const isLoading = messages === null || historyLoading;

  return (
    <div className="app-root">
      <div className="app-container">
        <DashboardNav />

        <div className="agent-header">
          <h1 className="app-title">Ask Nova</h1>
          <p className="page-subtitle">
            Your intelligent game discovery assistant.
          </p>
        </div>

        <div className="card agent-container">
          {/* Suggested prompts */}
          <div className="agent-suggestions">
            <p className="agent-suggestions__hint">Try asking:</p>
            <div className="agent-suggestions__list">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.label}
                  className="btn-ghost agent-suggestion"
                  onClick={() => sendMessage(s.prompt)}
                  disabled={isThinking || isLoading}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Chat window */}
          <div className="agent-chat">
            {isLoading ? (
              <div className="agent-message agent-message--agent">
                <span className="agent-message__label">Nova</span>
                <p className="agent-message__text agent-message__text--muted">
                  Loading conversation history…
                </p>
              </div>
            ) : (
              messages.map((msg, i) => (
                <div
                  key={msg.id || i}
                  className={`agent-message agent-message--${msg.role} ${msg.isError ? "agent-message--error" : ""}`}
                >
                  <span className="agent-message__label">
                    {msg.role === "user" ? "You" : "Nova"}
                  </span>
                  {msg.role === "agent" && msg.isStreaming && !msg.text ? (
                    <p className="agent-message__text agent-message__text--muted">
                      {streamingProgress ||
                        progressSteps[progressStepIndex] ||
                        "Nova is thinking..."}{" "}
                      <span className="agent-message__subtext">
                        First response may take a few seconds.
                      </span>
                    </p>
                  ) : msg.role === "agent" ? (
                    <div className="agent-message__markdown">
                      <ReactMarkdown>{msg.text}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="agent-message__text">{msg.text}</p>
                  )}

                  {/* Recommended game cards */}
                  {msg.recommendedPosts?.length > 0 && (
                    <div className="agent-recommendation-strip">
                      {msg.recommendedPosts.map((post) => (
                        <RecommendedCard key={post.id} post={post} />
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input row */}
          <div className="agent-input-row">
            <input
              className="input agent-input-row__field"
              placeholder="Ask about games, ratings, recommendations…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isThinking && !isLoading)
                  sendMessage();
              }}
              disabled={isThinking || isLoading}
            />
            <button
              type="button"
              className={`btn-primary agent-input-row__send ${isThinking ? "is-loading" : ""}`}
              onClick={() => sendMessage()}
              disabled={isThinking || isLoading || !input.trim()}
              aria-busy={isThinking}
            >
              {isThinking ? "…" : "Send"}
            </button>
          </div>

          {/* Clear history */}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              className="btn-ghost agent-clear-btn"
              onClick={handleClear}
              title="Delete all your AI conversation history"
            >
              Clear History
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
