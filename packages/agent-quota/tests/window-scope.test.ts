import { describe, expect, it } from 'vitest';
import { normalizeModelId } from '../src/window-scope';

describe('normalizeModelId', () => {
  it('strips bracketed context suffixes and folds opusplan', () => {
    expect(normalizeModelId('Claude-Opus-4-6[1m]')).toBe('claude-opus-4-6');
    expect(normalizeModelId('opusplan')).toBe('opus');
  });

  it('stays fast on long runs of unmatched brackets', () => {
    const hostile = `${'['.repeat(50_000)}x`;
    const started = performance.now();
    expect(normalizeModelId(hostile)).toBe(hostile);
    expect(performance.now() - started).toBeLessThan(500);
  });
});
