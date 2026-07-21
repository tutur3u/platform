export type ChatThinkingMode = 'fast' | 'thinking';

/**
 * Use the AI SDK's provider-neutral reasoning effort so each Google model
 * receives the configuration it supports. The Google provider maps `none` to
 * a zero budget for Gemini 2.5 and to `minimal` for Gemini 3, while `high`
 * uses the model's supported high-effort setting.
 */
export function resolveChatReasoningSettings(mode: ChatThinkingMode) {
  const includeThoughts = mode === 'thinking';

  return {
    effort: includeThoughts ? ('high' as const) : ('none' as const),
    includeThoughts,
  };
}
