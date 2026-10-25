import { describe, expect, it } from 'vitest';
import { evaluateStepUp } from './step-up';

const now = 1_800_000_000;
const proof = { sessionId: 's1', verifiedAt: now - 60 };

describe('evaluateStepUp', () => {
  it('accepts a proof inside the window and reports its expiry', () => {
    expect(evaluateStepUp(proof, now, 300)).toEqual({
      fresh: true,
      expiresAtSeconds: now + 240,
    });
  });

  it('fails closed without proof, with a stale proof, or with a future proof', () => {
    expect(evaluateStepUp(undefined, now)).toEqual({ fresh: false });
    expect(evaluateStepUp(null, now)).toEqual({ fresh: false });
    expect(
      evaluateStepUp({ ...proof, verifiedAt: now - 300 }, now, 300)
    ).toEqual({ fresh: false });
    expect(evaluateStepUp({ ...proof, verifiedAt: now + 5 }, now)).toEqual({
      fresh: false,
    });
  });

  it('honors the proof expiry and rejects malformed proofs', () => {
    expect(evaluateStepUp({ ...proof, expiresAt: now + 30 }, now, 300)).toEqual(
      { fresh: true, expiresAtSeconds: now + 30 }
    );
    expect(evaluateStepUp({ ...proof, expiresAt: now }, now, 300)).toEqual({
      fresh: false,
    });
    expect(
      evaluateStepUp({ sessionId: '', verifiedAt: now } as never, now)
    ).toEqual({ fresh: false });
  });
});
