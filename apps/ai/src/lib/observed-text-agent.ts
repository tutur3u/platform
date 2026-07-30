import type { Json } from '@tuturuuu/types';
import { gateway, isStepCount, ToolLoopAgent } from 'ai';
import {
  type PlaygroundToolName,
  resolvePlaygroundTools,
} from '@/lib/playground-tools';
import type { MeteredExecutionContext } from '@/lib/public-api';
import { recordMeteredExecutionStep } from '@/lib/public-api';

type StepSummary = {
  latencyMs: number | null;
  name: string;
  sequence: number;
  status: 'failed' | 'succeeded';
  type: 'model' | 'tool';
};

export function resolveGatewayRoutingOptions(
  modelId: string
): { order: string[] } | undefined {
  if (!modelId.startsWith('google/')) return undefined;

  return {
    order: ['google', 'vertex'],
  };
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
  const gatewayRoutingOptions = resolveGatewayRoutingOptions(modelId);
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
    model: gateway(modelId),
    providerOptions: gatewayRoutingOptions
      ? { gateway: gatewayRoutingOptions }
      : undefined,
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
        latencyMs,
        name: modelId,
        sequence: recorded.sequence,
        status: 'succeeded',
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
    onToolExecutionEnd: async ({ toolCall, toolExecutionMs, toolOutput }) => {
      const recorded = toolSequences.get(toolCall.toolCallId) ?? {
        sequence: nextSequence++,
        startedAt: Date.now() - toolExecutionMs,
      };
      const failed = toolOutput.type === 'tool-error';
      summaries.push({
        latencyMs: toolExecutionMs,
        name: toolCall.toolName,
        sequence: recorded.sequence,
        status: failed ? 'failed' : 'succeeded',
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
