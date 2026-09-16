import { ThinkingLevel } from '@google/genai';
import type { LiveMode } from '@tuturuuu/internal-api';

export const LIVE_MODELS = {
  flash: 'gemini-3.8-live',
  pro: 'gemini-3.8-live-extended-thinking',
} as const;

export function getLiveThinkingConfig(model: string, level?: ThinkingLevel) {
  if (model === LIVE_MODELS.flash) return {};
  return {
    thinkingConfig: {
      thinkingLevel:
        model === LIVE_MODELS.pro
          ? !level || level === ThinkingLevel.MINIMAL
            ? ThinkingLevel.HIGH
            : level
          : (level ?? ThinkingLevel.MINIMAL),
    },
  };
}

export function getLiveModeScope(mode: LiveMode) {
  return `assistant:web-dashboard:3.8:${mode}`;
}

export function getLiveContextWindowCompression(model: string) {
  const expandedContext =
    model === LIVE_MODELS.flash || model === LIVE_MODELS.pro;
  return {
    triggerTokens: expandedContext ? '100000' : '25000',
    slidingWindow: { targetTokens: expandedContext ? '64000' : '8000' },
  };
}
