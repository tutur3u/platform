import 'server-only';

import { google } from '@ai-sdk/google';
import {
  isGoogleModelId,
  toBareModelName,
} from '@tuturuuu/ai/credits/model-mapping';
import {
  gateway,
  generateText,
  NoObjectGeneratedError,
  type LanguageModelUsage,
  Output,
} from 'ai';
import { CitationAiError, usageSchema } from './contracts';
import { CITATION_FIX_INSTRUCTIONS, citationFixPrompt } from './prompt';
import type { CitationAiDependencies } from './service';

const zeroThinkingGoogleModels = new Set([
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
]);
const minimalThinkingGoogleModels = new Set([
  'gemini-3-flash',
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite',
  'gemini-3.1-flash-lite-preview',
]);
const lowThinkingGoogleModels = new Set([
  'gemini-3-pro-preview',
  'gemini-3.1-pro-preview',
  'gemini-3.1-pro-preview-customtools',
]);
const zeroThinkingAnthropicModels = new Set([
  'claude-haiku-4.5',
  'claude-sonnet-4.5',
  'claude-sonnet-4.6',
  'claude-opus-4.5',
  'claude-opus-4.6',
  'claude-opus-4.7',
  'claude-opus-4.8',
  'claude-opus-5',
  'claude-sonnet-5',
  'claude-haiku-5.5',
]);
const zeroThinkingOpenAiModels = new Set(['gpt-6-sol', 'gpt-6-luna']);

/** Gemini 3's total cap includes thinking; admission prices both token buckets. */
export function citationThinkingControls(
  modelId: string,
  maxOutputTokens: number
): Pick<Parameters<typeof generateText>[0], 'reasoning' | 'providerOptions'> {
  if (!Number.isSafeInteger(maxOutputTokens) || maxOutputTokens < 1)
    throw new CitationAiError('AI_UNAVAILABLE', 503);
  const bare = toBareModelName(modelId);
  if (isGoogleModelId(modelId) && zeroThinkingGoogleModels.has(bare))
    return {
      reasoning: 'none',
      providerOptions: {
        google: {
          thinkingConfig: { thinkingBudget: 0, includeThoughts: false },
        },
      },
    };
  if (isGoogleModelId(modelId) && minimalThinkingGoogleModels.has(bare))
    return {
      reasoning: 'minimal',
      providerOptions: {
        google: {
          thinkingConfig: { thinkingLevel: 'minimal', includeThoughts: false },
        },
      },
    };
  if (isGoogleModelId(modelId) && lowThinkingGoogleModels.has(bare))
    return {
      reasoning: 'low',
      providerOptions: {
        google: {
          thinkingConfig: { thinkingLevel: 'low', includeThoughts: false },
        },
      },
    };
  if (modelId.startsWith('anthropic/') && zeroThinkingAnthropicModels.has(bare))
    return {
      reasoning: 'none',
      providerOptions: {
        gateway: { only: ['anthropic'] },
        anthropic: { thinking: { type: 'disabled' }, effort: 'low' },
      },
    };
  if (modelId.startsWith('openai/') && zeroThinkingOpenAiModels.has(bare))
    return {
      reasoning: 'none',
      providerOptions: {
        gateway: { only: ['openai'] },
        openai: { reasoningEffort: 'none', reasoningSummary: null },
      },
    };
  // Unknown capabilities never authorize an implicit reasoning expense or a fallback.
  throw new CitationAiError('AI_UNAVAILABLE', 503);
}

export function reportedCitationUsage(usage: LanguageModelUsage | undefined) {
  const parsed = usageSchema.safeParse({
    inputTokens: usage?.inputTokens,
    outputTokens: usage?.outputTokens,
    reasoningTokens: usage?.outputTokenDetails?.reasoningTokens ?? 0,
  });
  if (!parsed.success)
    throw new CitationAiError('BILLING_PENDING', 503, 'unknown');
  if (parsed.data.reasoningTokens > parsed.data.outputTokens)
    throw new CitationAiError('BILLING_PENDING', 503, 'unknown');
  // outputTokens is the provider's TOTAL completion count with reasoning as a
  // subset. deductAiCredits splits the reasoning bucket out itself, so the
  // total must pass through unmodified or reasoning is subtracted twice.
  return parsed.data;
}

/** One text-only provider call, with existing plan model routing and no memory/tools. */
export const generateCitationFix: CitationAiDependencies['generate'] = async (
  input
) => {
  const thinkingControls = citationThinkingControls(
    input.modelId,
    input.maxOutputTokens
  );
  try {
    const result = await generateText({
      model: isGoogleModelId(input.modelId)
        ? google(toBareModelName(input.modelId))
        : gateway(input.modelId),
      system: CITATION_FIX_INSTRUCTIONS,
      prompt: citationFixPrompt(input.input, input.existingWork),
      output: Output.json(),
      maxOutputTokens: input.maxOutputTokens,
      ...thinkingControls,
      maxRetries: 0,
      abortSignal: input.signal,
      telemetry: {
        isEnabled: false,
        recordInputs: false,
        recordOutputs: false,
      },
    });
    return {
      value: result.output,
      usage: reportedCitationUsage(result.totalUsage),
    };
  } catch (error) {
    if (NoObjectGeneratedError.isInstance(error))
      return { value: null, usage: reportedCitationUsage(error.usage) };
    // A provider error or abort can follow billable work; never invent a zero charge.
    throw new CitationAiError('BILLING_PENDING', 503, 'unknown');
  }
};
