import { describe, expect, it } from 'vitest';
import { getChatProvider, toChatModel } from './chat-model';

describe('Rewise chat models', () => {
  it('normalizes legacy unqualified Google model IDs', () => {
    expect(toChatModel('gemini-3-flash')).toEqual({
      label: 'gemini-3-flash',
      provider: 'google',
      value: 'google/gemini-3-flash',
    });
  });

  it('preserves gateway model providers', () => {
    expect(getChatProvider('anthropic/claude-sonnet')).toBe('anthropic');
    expect(toChatModel('anthropic/claude-sonnet')).toEqual({
      label: 'claude-sonnet',
      provider: 'anthropic',
      value: 'anthropic/claude-sonnet',
    });
  });
});
