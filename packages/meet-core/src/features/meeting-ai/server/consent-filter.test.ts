import { describe, expect, it } from 'vitest';
import { consentedChunks } from './consent-filter';

const a = '11111111-1111-4111-8111-111111111111';
const b = '22222222-2222-4222-8222-222222222222';
const speaker = (accountId: string) => ({
  accountId,
  displayName: accountId === a ? 'Ada' : 'Ben',
  kind: 'microphone' as const,
});
const segment = (accountId: string | null, text: string, at = 0) => ({
  speaker: accountId ? speaker(accountId) : null,
  kind: 'microphone' as const,
  startSeconds: at,
  transcript: text,
});
const chunk = (usage: unknown, transcript: string | null = 'x') => ({
  transcript,
  usage,
});

describe('consentedChunks', () => {
  it('keeps consented chunk-level speakers and drops everyone else', () => {
    const mine = chunk({ speaker: speaker(a) }, 'ADA');
    const theirs = chunk({ speaker: speaker(b) }, 'BEN');
    const unknown = chunk({}, 'NOBODY');
    const result = consentedChunks([mine, theirs, unknown], new Set([a]));
    expect(result.chunks).toEqual([mine]);
    expect(result.excluded).toBe(2);
  });

  it('removes non-consented and unattributed segments from a mixed chunk', () => {
    const mixed = chunk(
      {
        segments: [
          segment(a, 'ADA-1'),
          segment(b, 'BEN-SECRET', 2),
          segment(null, 'ANON-SECRET', 3),
        ],
      },
      'ADA-1 BEN-SECRET ANON-SECRET'
    );
    const { chunks, excluded } = consentedChunks([mixed], new Set([a]));
    expect(excluded).toBe(1);
    const json = JSON.stringify(chunks);
    expect(json).toContain('ADA-1');
    expect(json).not.toContain('BEN-SECRET');
    expect(json).not.toContain('ANON-SECRET');
  });

  it('drops a chunk with no consented segment entirely', () => {
    const only = chunk({ segments: [segment(b, 'BEN-SECRET')] }, 'BEN-SECRET');
    expect(consentedChunks([only], new Set([a])).chunks).toEqual([]);
  });

  it('uses nothing when nobody consented', () => {
    const mine = chunk({ speaker: speaker(a) });
    expect(consentedChunks([mine], new Set()).chunks).toEqual([]);
  });

  it('leaves a fully consented chunk untouched', () => {
    const mine = chunk({ segments: [segment(a, 'ADA')] });
    expect(consentedChunks([mine], new Set([a])).chunks[0]).toBe(mine);
  });
});
