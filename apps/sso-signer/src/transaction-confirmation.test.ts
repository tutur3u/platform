import { describe, expect, it } from 'vite-plus/test';
import {
  confirmationFor,
  refuseAllConfirmation,
  selectConfirmation,
  uncheckedLocalConfirmation,
} from './transaction-confirmation';

const MODES: unknown[] = [
  'unchecked-local',
  'UNCHECKED-LOCAL',
  'unchecked',
  '',
  undefined,
  null,
  1,
  true,
  ['unchecked-local'],
];
const ENVIRONMENTS: unknown[] = [
  'local',
  'LOCAL',
  'staging',
  'production',
  '',
  undefined,
  null,
  0,
  { toString: () => 'local' },
];
const pairs = MODES.flatMap((mode) =>
  ENVIRONMENTS.map((environment) => ({ mode, environment }))
);

describe('transaction confirmation selection', () => {
  it('chooses unchecked only for (unchecked-local, local) in an unchecked build', () => {
    for (const pair of pairs) {
      const expected =
        pair.mode === 'unchecked-local' && pair.environment === 'local'
          ? uncheckedLocalConfirmation
          : refuseAllConfirmation;
      expect(confirmationFor(pair, true), JSON.stringify(pair)).toBe(expected);
      expect(confirmationFor(pair, false), JSON.stringify(pair)).toBe(
        refuseAllConfirmation
      );
    }
  });

  it('refuses every pair in the production-defined build', () => {
    for (const pair of pairs) {
      expect(selectConfirmation(pair), JSON.stringify(pair)).toBe(
        refuseAllConfirmation
      );
    }
  });

  it('refuses with confirmation_unavailable', async () => {
    expect(await refuseAllConfirmation.confirm({} as never)).toEqual({
      ok: false,
      error: 'confirmation_unavailable',
    });
  });
});
