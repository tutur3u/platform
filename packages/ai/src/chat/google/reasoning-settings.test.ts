import { describe, expect, it } from 'vitest';
import { resolveChatReasoningSettings } from './reasoning-settings';

describe('resolveChatReasoningSettings', () => {
  it('uses provider-aware minimal reasoning for fast mode', () => {
    expect(resolveChatReasoningSettings('fast')).toEqual({
      effort: 'none',
      includeThoughts: false,
    });
  });

  it('requests visible high-effort reasoning for thinking mode', () => {
    expect(resolveChatReasoningSettings('thinking')).toEqual({
      effort: 'high',
      includeThoughts: true,
    });
  });
});
