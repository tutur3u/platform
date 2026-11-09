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
    inputAudioTokens: tokensFor(promptDetails, 'AUDIO'),
    inputImageTokens: tokensFor(promptDetails, 'IMAGE'),
    inputTextTokens:
      tokensFor(promptDetails, 'TEXT') + tokensFor(toolDetails, 'TEXT'),
    inputVideoTokens: tokensFor(promptDetails, 'VIDEO'),
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
