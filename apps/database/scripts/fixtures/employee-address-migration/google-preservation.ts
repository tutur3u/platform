import assert from 'node:assert/strict';
import { z } from 'zod';

const Row = z.record(z.string(), z.unknown());
const PersistedRow = Row.and(z.object({ id: z.string().min(1) }));
const Baseline = z.object({
  user: Row,
  google: Row,
  sessions: z.array(PersistedRow).min(1),
  tokens: z
    .array(
      Row.and(
        z.object({
          id: z.union([
            z.string().min(1),
            z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
          ]),
        })
      )
    )
    .min(1),
  mail: z.array(Row).min(1),
});

/** Parse at the SQL boundary, preserving every column for exact comparison. */
export function googlePreservationBaseline(value: unknown) {
  const baseline = Baseline.parse(value);
  assert.equal(
    new Set(baseline.sessions.map((row) => row.id)).size,
    baseline.sessions.length
  );
  assert.equal(
    new Set(baseline.tokens.map((row) => row.id)).size,
    baseline.tokens.length
  );
  return baseline;
}

export function assertGooglePreserved(before: unknown, after: unknown) {
  assert.deepEqual(
    googlePreservationBaseline(after),
    googlePreservationBaseline(before)
  );
}

/** Controls use actual nonempty readback rows, without altering the database. */
export function assertGooglePreservationNegativeControls(
  before: unknown,
  after: unknown
) {
  const baseline = googlePreservationBaseline(after);
  const session = baseline.sessions[0],
    token = baseline.tokens[0];
  assert.ok(session);
  assert.ok(token);
  assert.equal(typeof token.revoked, 'boolean');
  assert.throws(() =>
    assertGooglePreserved(before, {
      ...baseline,
      sessions: baseline.sessions.slice(1),
    })
  );
  assert.throws(() =>
    assertGooglePreserved(before, {
      ...baseline,
      tokens: baseline.tokens.slice(1),
    })
  );
  assert.throws(() =>
    assertGooglePreserved(before, {
      ...baseline,
      sessions: [
        { ...session, id: 'negative-control-mutated-session' },
        ...baseline.sessions.slice(1),
      ],
    })
  );
  assert.throws(() =>
    assertGooglePreserved(before, {
      ...baseline,
      tokens: [
        { ...token, revoked: !token.revoked },
        ...baseline.tokens.slice(1),
      ],
    })
  );
  return 4;
}
