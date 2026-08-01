import { describe, expect, it } from 'vitest';
import {
  categorizePlaygroundModels,
  defaultPlaygroundModel,
  textPlaygroundModels,
} from './playground-models';

const models = [
  {
    contextWindow: 32_000,
    id: 'google/gemini-3.1-flash-tts-preview',
    maxOutputTokens: 8_000,
    name: 'Gemini 3.1 Flash TTS Preview',
    ownedBy: 'google',
    type: 'audio',
  },
  {
    contextWindow: 1_000_000,
    id: 'google/gemini-3.5-flash-lite-preview',
    maxOutputTokens: 65_536,
    name: 'Gemini 3.5 Flash Lite',
    ownedBy: 'google',
    type: 'language',
  },
  {
    contextWindow: 128_000,
    id: 'openai/gpt-5-mini',
    maxOutputTokens: 32_768,
    name: 'GPT-5 mini',
    ownedBy: 'openai',
    type: 'language',
  },
];

describe('playground model selection', () => {
  it('keeps non-text models out of text endpoints', () => {
    expect(textPlaygroundModels(models)).toHaveLength(2);
  });

  it('prefers Gemini 3.5 Flash Lite when available', () => {
    expect(defaultPlaygroundModel(models)).toBe(
      'google/gemini-3.5-flash-lite-preview'
    );
  });

  it('groups compatible models by provider', () => {
    expect(categorizePlaygroundModels(models)).toEqual([
      { models: [models[1]], provider: 'google' },
      { models: [models[2]], provider: 'openai' },
    ]);
  });
});
