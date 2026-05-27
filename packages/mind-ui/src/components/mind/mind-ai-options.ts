import type { AIModelUI } from '@tuturuuu/types';

export const MIND_AI_MODELS: AIModelUI[] = [
  {
    label: 'Gemini 3.1 Flash Lite',
    provider: 'google',
    value: 'google/gemini-3.1-flash-lite',
  },
  {
    label: 'Gemini 2.5 Flash',
    provider: 'google',
    value: 'google/gemini-2.5-flash',
  },
  {
    label: 'Gemini 2.5 Pro',
    provider: 'google',
    value: 'google/gemini-2.5-pro',
  },
];

export const INITIAL_MIND_AI_MODEL = MIND_AI_MODELS[0]!;
export type MindAiThinkingMode = 'fast' | 'thinking';
