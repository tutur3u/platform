import { describe, expect, it } from 'vitest';
import { resolveInitialThinkingMode } from '../use-mira-chat-config';

describe('resolveInitialThinkingMode', () => {
  it('defaults to fast when no stored mode exists', () => {
    expect(resolveInitialThinkingMode(null)).toBe('fast');
  });

  it('ignores stale stored thinking mode so new sessions stay fast-first', () => {
    expect(resolveInitialThinkingMode('thinking')).toBe('fast');
  });

  it('keeps an explicit stored fast mode', () => {
    expect(resolveInitialThinkingMode('fast')).toBe('fast');
  });
});
