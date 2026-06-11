import { fetchEventSource } from '@microsoft/fetch-event-source';

function safeJsonParse(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function resolveDefaultStreamEndpoint() {
  if (import.meta.env.VITE_AI_SSE_URI) return import.meta.env.VITE_AI_SSE_URI;

  const gqlUri = import.meta.env.VITE_GRAPHQL_URI || 'http://localhost:4001/graphql';
  return gqlUri.replace(/\/graphql\/?$/, '/ai/stream');
}

/**
 * Stream Nova AI response via Server-Sent Events (SSE).
 *
 * Expected server events (recommended contract):
 * - progress: { message: string, step?: string }
 * - token:    { text: string }
 * - final:    { answer: string, recommendedPosts?: any[] }
 * - done:     { answer?: string, recommendedPosts?: any[] }
 * - error:    { message: string }
 */
export async function streamNovaResponse({
  message,
  endpoint = resolveDefaultStreamEndpoint(),
  token,
  signal,
  onOpen,
  onProgress,
  onToken,
  onFinal,
  onDone,
  onError,
}) {
  if (!message?.trim()) {
    throw new Error('message is required for streamNovaResponse');
  }

  const authToken = token ?? localStorage.getItem('token') ?? '';

  await fetchEventSource(endpoint, {
    method: 'POST',
    credentials: 'include',
    signal,
    openWhenHidden: true,
    headers: {
      Accept: 'text/event-stream',
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: JSON.stringify({ message: message.trim() }),

    async onopen(response) {
      if (!response.ok) {
        throw new Error(`SSE connection failed: ${response.status} ${response.statusText}`);
      }
      if (!response.headers.get('content-type')?.includes('text/event-stream')) {
        throw new Error('Endpoint did not return text/event-stream');
      }
      onOpen?.(response);
    },

    onmessage(event) {
      const payload = safeJsonParse(event.data);

      if (event.event === 'progress') {
        const text = payload?.message ?? event.data;
        onProgress?.(text, payload);
        return;
      }

      if (event.event === 'token') {
        const tokenText = payload?.text ?? event.data;
        onToken?.(tokenText, payload);
        return;
      }

      if (event.event === 'final') {
        onFinal?.(payload ?? {});
        return;
      }

      if (event.event === 'done') {
        onDone?.(payload ?? {});
        return;
      }

      if (event.event === 'error') {
        const errorMessage = payload?.message ?? event.data ?? 'Stream error';
        throw new Error(errorMessage);
      }

      // Fallback for servers that only emit default `message` events.
      if (payload?.text) {
        onToken?.(payload.text, payload);
      } else if (event.data) {
        onToken?.(event.data, payload);
      }
    },

    onerror(err) {
      onError?.(err);
      throw err;
    },

    onclose() {
      onDone?.({});
    },
  });
}
