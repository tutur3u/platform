import { describe, expect, it } from 'vitest';
import { fleetAnswerInputSchema, fleetStateSchema } from './contract';
import { sampleFleetState } from './sample-state.fixture';
import { scrubFleetText } from './scrub';

describe('scrubFleetText', () => {
  it.each([
    ['see https://example.com/x?token=1 now', 'see now'],
    ['mail ops@example.com', 'mail'],
    ['path /Users/skora/.local/share/x done', 'path done'],
    ['id 3f2c1b9e-1234-4abc-8def-0123456789ab', 'id'],
    ['key ghp_abcdefghijklmnopqrstu', 'key'],
    ['api_key=supersecret value', 'value'],
    ['jwt eyJhbGciOiJIUzI1.eyJzdWIiOiIx.sig', 'jwt'],
    ['zero​width', 'zerowidth'],
  ])('removes sensitive shapes from %j', (input, expected) => {
    expect(scrubFleetText(input, 80)).toBe(expected);
  });

  it('shortens at a word boundary with an ellipsis', () => {
    const out = scrubFleetText('alpha beta gamma delta epsilon', 18);
    expect(out).toBe('alpha beta gamma…');
    expect(out.length).toBeLessThanOrEqual(18);
  });
});

describe('fleetStateSchema', () => {
  it('keeps the additive failure split and refuses unknown resolutions', () => {
    const lane = sampleFleetState().lanes[0];
    const parsed = fleetStateSchema.parse(
      sampleFleetState({
        counts: {
          running: 2,
          waiting: 1,
          queued: 0,
          idle: 4,
          failed: 1,
          recovered: 2,
          quotaRecovered: 1,
          cancelled: 1,
        },
        lanes: [{ ...lane, state: 'idle', resolution: 'quotaRecovered' }],
      })
    );
    expect(parsed.counts.recovered).toBe(2);
    expect(parsed.lanes[0]?.resolution).toBe('quotaRecovered');
    expect(fleetStateSchema.parse(sampleFleetState()).counts.recovered).toBe(
      undefined
    );
    expect(
      fleetStateSchema.safeParse(
        sampleFleetState({ lanes: [{ ...lane, resolution: 'superseded' }] })
      ).success
    ).toBe(false);
  });

  it('accepts a valid snapshot and scrubs free text', () => {
    const parsed = fleetStateSchema.parse(
      sampleFleetState({
        lanes: [
          {
            ...sampleFleetState().lanes[0],
            title: 'Fix https://evil.example/leak in billing',
          },
        ],
      })
    );
    expect(parsed.lanes[0]?.title).toBe('Fix in billing');
  });

  it('labels a lane whose title is only sensitive content', () => {
    const parsed = fleetStateSchema.parse(
      sampleFleetState({
        lanes: [{ ...sampleFleetState().lanes[0], title: 'https://a.b/c' }],
      })
    );
    expect(parsed.lanes[0]?.title).toBe('Untitled lane');
  });

  it('rejects a decision title that is only sensitive content', () => {
    const decision = { ...sampleFleetState().decisions[0], title: 'a@b.co' };
    expect(
      fleetStateSchema.safeParse(sampleFleetState({ decisions: [decision] }))
        .success
    ).toBe(false);
  });

  it('rejects a recommended option that is not offered', () => {
    const decision = {
      ...sampleFleetState().decisions[0],
      recommendedOptionId: 'nope',
    };
    expect(
      fleetStateSchema.safeParse(sampleFleetState({ decisions: [decision] }))
        .success
    ).toBe(false);
  });

  it('rejects unknown lane states, opaque ids and oversized lists', () => {
    const lane = sampleFleetState().lanes[0];
    for (const lanes of [
      [{ ...lane, state: 'zombie' }],
      [{ ...lane, id: 'Thread/With Spaces' }],
      Array.from({ length: 301 }, (_, i) => ({ ...lane, id: `l${i}` })),
    ]) {
      expect(
        fleetStateSchema.safeParse(sampleFleetState({ lanes })).success
      ).toBe(false);
    }
  });
});

describe('fleetAnswerInputSchema', () => {
  it('requires text for a reply', () => {
    expect(fleetAnswerInputSchema.safeParse({ action: 'reply' }).success).toBe(
      false
    );
    expect(
      fleetAnswerInputSchema.safeParse({ action: 'reply', text: 'Go' }).success
    ).toBe(true);
    expect(
      fleetAnswerInputSchema.safeParse({ action: 'approve', optionId: 'yes' })
        .success
    ).toBe(true);
  });
});
