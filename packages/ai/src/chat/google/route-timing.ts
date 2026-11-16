/**
 * Per-request latency spans for the shared chat route.
 *
 * Pre-stream spans are exposed as a `Server-Timing` header so the browser can
 * read them without server log access. Stream spans (time to first chunk,
 * first text, each model step and tool) are attached to the assistant
 * message metadata on finish and, when `AI_CHAT_TIMING_LOG=1`, logged as one
 * JSON line. Spans hold durations and tool names only: never content, ids or
 * user data.
 */

export type ChatStepTiming = {
  /** Milliseconds from stream start to this step finishing. */
  endMs: number;
  finishReason?: string;
  inputTokens?: number;
  outputTokens?: number;
  tools: string[];
};

export type ChatRouteTiming = {
  firstChunkMs?: number;
  firstTextMs?: number;
  preStream: Record<string, number>;
  preStreamMs: number;
  steps: ChatStepTiming[];
  /** Summed execution time per tool name. */
  toolMs: Record<string, number>;
  totalMs?: number;
};

const SPAN_NAME = /[^a-zA-Z0-9_-]/g;

export function createChatRouteTimer(
  now: () => number = () => performance.now()
) {
  const start = now();
  let last = start;
  let streamStart: number | null = null;
  const preStream: Record<string, number> = {};
  const timing: ChatRouteTiming = {
    preStream,
    preStreamMs: 0,
    steps: [],
    toolMs: {},
  };

  const since = (from: number) => Math.round(now() - from);

  return {
    /** Records the time since the previous mark under `name`. */
    mark(name: string) {
      const at = now();
      const key = name.replace(SPAN_NAME, '_');
      preStream[key] = (preStream[key] ?? 0) + Math.round(at - last);
      last = at;
    },
    /** Wraps a promise so its own duration is recorded, for parallel work. */
    async span<T>(name: string, work: Promise<T>): Promise<T> {
      const from = now();
      try {
        return await work;
      } finally {
        preStream[`${name.replace(SPAN_NAME, '_')}_wall`] = since(from);
      }
    },
    streamStarted() {
      streamStart = now();
      timing.preStreamMs = Math.round(streamStart - start);
    },
    chunk(type: string) {
      if (streamStart === null) return;
      if (timing.firstChunkMs === undefined)
        timing.firstChunkMs = since(streamStart);
      if (type === 'text-delta' && timing.firstTextMs === undefined)
        timing.firstTextMs = since(streamStart);
    },
    step(step: {
      finishReason?: string;
      toolCalls?: ReadonlyArray<{ toolName: string }>;
      usage?: { inputTokens?: number; outputTokens?: number };
    }) {
      timing.steps.push({
        endMs: streamStart === null ? 0 : since(streamStart),
        finishReason: step.finishReason,
        inputTokens: step.usage?.inputTokens,
        outputTokens: step.usage?.outputTokens,
        tools: (step.toolCalls ?? []).map((call) => call.toolName),
      });
    },
    tool(name: string, ms: number) {
      const key = name.replace(SPAN_NAME, '_');
      timing.toolMs[key] = (timing.toolMs[key] ?? 0) + Math.round(ms);
    },
    finish(): ChatRouteTiming {
      if (timing.totalMs === undefined) timing.totalMs = since(start);
      if (process.env.AI_CHAT_TIMING_LOG === '1') {
        console.info(JSON.stringify({ event: 'ai_chat_timing', ...timing }));
      }
      return timing;
    },
    serverTimingHeader(): string {
      return [
        ...Object.entries(preStream).map(([key, ms]) => `${key};dur=${ms}`),
        `pre_stream;dur=${timing.preStreamMs}`,
      ].join(', ');
    },
    get timing() {
      return timing;
    },
  };
}

export type ChatRouteTimer = ReturnType<typeof createChatRouteTimer>;
