import type { UsageMetadata } from '@google/genai';
import type { GeminiLiveUsageSnapshot } from '@tuturuuu/internal-api';

type ModalityDetail = {
  modality?: string;
  tokenCount?: number;
};

function tokensFor(
  details: ModalityDetail[] | undefined,
  modality: 'AUDIO' | 'IMAGE' | 'TEXT' | 'VIDEO'
) {
  return (details ?? []).reduce(
    (total, detail) =>
      detail.modality === modality
        ? total + Math.max(0, detail.tokenCount ?? 0)
        : total,
    0
  );
}

export function normalizeGeminiLiveUsage(
  metadata: UsageMetadata,
  searchQueries: number
): GeminiLiveUsageSnapshot {
  const promptDetails = metadata.promptTokensDetails as
    | ModalityDetail[]
    | undefined;
  const responseDetails = metadata.responseTokensDetails as
    | ModalityDetail[]
    | undefined;
  const toolDetails = metadata.toolUsePromptTokensDetails as
    | ModalityDetail[]
    | undefined;

  return {
    inputAudioTokens:
      tokensFor(promptDetails, 'AUDIO') + tokensFor(toolDetails, 'AUDIO'),
    inputImageTokens:
      tokensFor(promptDetails, 'IMAGE') + tokensFor(toolDetails, 'IMAGE'),
    inputTextTokens:
      tokensFor(promptDetails, 'TEXT') + tokensFor(toolDetails, 'TEXT'),
    inputVideoTokens:
      tokensFor(promptDetails, 'VIDEO') + tokensFor(toolDetails, 'VIDEO'),
    outputAudioTokens: tokensFor(responseDetails, 'AUDIO'),
    outputTextTokens: tokensFor(responseDetails, 'TEXT'),
    searchQueries: Math.max(0, searchQueries),
    thinkingTokens: Math.max(0, metadata.thoughtsTokenCount ?? 0),
  };
}

export const EMPTY_GEMINI_LIVE_USAGE: GeminiLiveUsageSnapshot = {
  inputAudioTokens: 0,
  inputImageTokens: 0,
  inputTextTokens: 0,
  inputVideoTokens: 0,
  outputAudioTokens: 0,
  outputTextTokens: 0,
  searchQueries: 0,
  thinkingTokens: 0,
};

/** Provider usage is per generation; cumulative billing must include every response. */
export function accumulateLiveUsage(
  total: GeminiLiveUsageSnapshot,
  metadata: UsageMetadata,
  searchQueries = 0
) {
  const next = normalizeGeminiLiveUsage(metadata, searchQueries);
  const usage = { ...total };
  for (const key of Object.keys(usage) as Array<keyof GeminiLiveUsageSnapshot>)
    usage[key] += next[key];
  const inputKnown =
    next.inputAudioTokens +
    next.inputImageTokens +
    next.inputVideoTokens +
    next.inputTextTokens;
  const outputKnown = next.outputAudioTokens + next.outputTextTokens;
  const toolKnown =
    tokensFor(metadata.toolUsePromptTokensDetails, 'TEXT') +
    tokensFor(metadata.toolUsePromptTokensDetails, 'AUDIO') +
    tokensFor(metadata.toolUsePromptTokensDetails, 'IMAGE') +
    tokensFor(metadata.toolUsePromptTokensDetails, 'VIDEO');
  const incomplete =
    toolKnown < (metadata.toolUsePromptTokenCount ?? 0) ||
    inputKnown - toolKnown < (metadata.promptTokenCount ?? 0) ||
    outputKnown < (metadata.responseTokenCount ?? 0);
  return { usage, incomplete };
}
