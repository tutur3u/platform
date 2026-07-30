import { google } from '@ai-sdk/google';
import { toBareModelName } from '@tuturuuu/ai/credits/model-mapping';
import type { Json } from '@tuturuuu/types';
import { isStepCount, ToolLoopAgent } from 'ai';
import {
  type PlaygroundToolName,
  resolvePlaygroundTools,
} from '@/lib/playground-tools';
import type { MeteredExecutionContext } from '@/lib/public-api';
import { recordMeteredExecutionStep } from '@/lib/public-api';

type StepSummary = {
  cachedInputTokens: number;
  callId: string | null;
  completedAt: string | null;
  effectiveOutputTokensPerSecond: number | null;
  finishReason: string | null;
  inputJson: string | null;
  inputTokens: number;
  latencyMs: number | null;
  modelId: string | null;
  name: string;
  outputJson: string | null;
  outputTokens: number;
  provider: string | null;
  reasoningTokens: number;
  responseId: string | null;
  responseTimeMs: number | null;
  sequence: number;
  startedAt: string | null;
  status: 'failed' | 'succeeded';
  timeToFirstOutputMs: number | null;
  toolCallCount: number;
  toolCallId: string | null;
  toolResultCount: number;
  type: 'model' | 'tool';
};

const TRACE_VALUE_LIMIT = 4_000;
const REDACTED = '[REDACTED]';

function serializeTraceValue(value: unknown): string | null {
  if (value === undefined) return null;

  const seen = new WeakSet<object>();
  try {
    const serialized = JSON.stringify(value, (key, nestedValue) => {
      if (/authorization|api.?key|cookie|password|secret|token/iu.test(key)) {
        return REDACTED;
      }
      if (nestedValue instanceof Error) {
        return { name: nestedValue.name };
      }
      if (typeof nestedValue === 'object' && nestedValue !== null) {
        if (seen.has(nestedValue)) return '[Circular]';
        seen.add(nestedValue);
      }
      return nestedValue;
    });
    if (!serialized) return null;
    return serialized.length <= TRACE_VALUE_LIMIT
      ? serialized
      : `${serialized.slice(0, TRACE_VALUE_LIMIT)}…`;
  } catch {
    return null;
  }
}

export function createObservedTextAgent({
  context,
  instructions,
  maxOutputTokens,
  maxSteps,
  modelId,
  signal,
  toolNames,
}: {
  context: MeteredExecutionContext;
  instructions?: string;
  maxOutputTokens: number;
  maxSteps: number;
  modelId: string;
  signal: AbortSignal;
  toolNames: PlaygroundToolName[];
}) {
  let nextSequence = 0;
  const modelSequences = new Map<
    number,
    { sequence: number; startedAt: number }
  >();
  const toolSequences = new Map<
    string,
    { sequence: number; startedAt: number }
  >();
  const summaries: StepSummary[] = [];

  const agent = new ToolLoopAgent({
    instructions,
    maxOutputTokens,
    model: google(toBareModelName(modelId)),
    onStepStart: ({ stepNumber }) => {
      modelSequences.set(stepNumber, {
        sequence: nextSequence++,
        startedAt: Date.now(),
      });
    },
    onStepEnd: async (step) => {
      const recorded = modelSequences.get(step.stepNumber) ?? {
        sequence: nextSequence++,
        startedAt: Date.now() - step.performance.stepTimeMs,
      };
      const latencyMs = step.performance.stepTimeMs;
      summaries.push({
        cachedInputTokens: step.usage.inputTokenDetails.cacheReadTokens ?? 0,
        callId: step.callId,
        completedAt: new Date(recorded.startedAt + latencyMs).toISOString(),
        effectiveOutputTokensPerSecond: Number.isFinite(
          step.performance.effectiveOutputTokensPerSecond
        )
          ? step.performance.effectiveOutputTokensPerSecond
          : null,
        finishReason: String(step.finishReason),
        inputJson: null,
        inputTokens: step.usage.inputTokens ?? 0,
        latencyMs,
        modelId: step.model.modelId,
        name: modelId,
        outputJson: null,
        outputTokens: step.usage.outputTokens ?? 0,
        provider: step.model.provider,
        reasoningTokens: step.usage.outputTokenDetails.reasoningTokens ?? 0,
        responseId: step.response.id,
        responseTimeMs: step.performance.responseTimeMs,
        sequence: recorded.sequence,
        startedAt: new Date(recorded.startedAt).toISOString(),
        status: 'succeeded',
        timeToFirstOutputMs: step.performance.timeToFirstOutputMs ?? null,
        toolCallCount: step.toolCalls.length,
        toolCallId: null,
        toolResultCount: step.toolResults.length,
        type: 'model',
      });
      await recordMeteredExecutionStep(context, {
        inputTokens: step.usage.inputTokens ?? 0,
        kind: 'model',
        latencyMs,
        metadata: {
          finish_reason: String(step.finishReason),
          tool_call_count: step.toolCalls.length,
          tool_result_count: step.toolResults.length,
        } as Json,
        name: 'generation',
        outputTokens: step.usage.outputTokens ?? 0,
        sequence: recorded.sequence,
        startedAt: new Date(recorded.startedAt).toISOString(),
        status: signal.aborted ? 'aborted' : 'succeeded',
      });
    },
    onToolExecutionStart: ({ toolCall }) => {
      toolSequences.set(toolCall.toolCallId, {
        sequence: nextSequence++,
        startedAt: Date.now(),
      });
    },
    onToolExecutionEnd: async ({
      callId,
      toolCall,
      toolExecutionMs,
      toolOutput,
    }) => {
      const recorded = toolSequences.get(toolCall.toolCallId) ?? {
        sequence: nextSequence++,
        startedAt: Date.now() - toolExecutionMs,
      };
      const failed = toolOutput.type === 'tool-error';
      summaries.push({
        cachedInputTokens: 0,
        callId,
        completedAt: new Date(
          recorded.startedAt + toolExecutionMs
        ).toISOString(),
        effectiveOutputTokensPerSecond: null,
        finishReason: null,
        inputJson: serializeTraceValue(toolCall.input),
        inputTokens: 0,
        latencyMs: toolExecutionMs,
        modelId: null,
        name: toolCall.toolName,
        outputJson:
          toolOutput.type === 'tool-result'
            ? serializeTraceValue(toolOutput.output)
            : serializeTraceValue(toolOutput.error),
        outputTokens: 0,
        provider: null,
        reasoningTokens: 0,
        responseId: null,
        responseTimeMs: null,
        sequence: recorded.sequence,
        startedAt: new Date(recorded.startedAt).toISOString(),
        status: failed ? 'failed' : 'succeeded',
        timeToFirstOutputMs: null,
        toolCallCount: 0,
        toolCallId: toolCall.toolCallId,
        toolResultCount: 0,
        type: 'tool',
      });
      await recordMeteredExecutionStep(context, {
        errorClass:
          failed && toolOutput.error instanceof Error
            ? toolOutput.error.name
            : null,
        kind: 'tool',
        latencyMs: toolExecutionMs,
        metadata: {},
        name: toolCall.toolName,
        sequence: recorded.sequence,
        startedAt: new Date(recorded.startedAt).toISOString(),
        status: failed ? 'failed' : 'succeeded',
      });
    },
    stopWhen: isStepCount(maxSteps),
    telemetry: {
      functionId: 'ai-studio.public-text',
      isEnabled: true,
      recordInputs: false,
      recordOutputs: false,
    },
    tools: resolvePlaygroundTools(toolNames),
  });

  return {
    agent,
    summaries: () =>
      [...summaries].sort((left, right) => left.sequence - right.sequence),
  };
}
