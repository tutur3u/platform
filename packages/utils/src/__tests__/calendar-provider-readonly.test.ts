import { describe, expect, it } from 'vitest';
import {
  isProviderRecurrenceReadonly,
  markProviderRecurrenceReadonly,
  providerReadonlyProjection,
} from '../calendar-provider-readonly';

describe('readonly provider projection', () => {
  it.each(['google', 'microsoft'] as const)(
    'projects %s internal marker without leaking raw provider snapshot',
    (provider) => {
      const original = { id: 'instance', summary: 'Private title' };
      const projected = providerReadonlyProjection(
        markProviderRecurrenceReadonly(original, provider, 'master')
      );
      expect(projected).toEqual({
        locked: true,
        scheduling_metadata: {
          provider_recurrence: {
            state: 'unsupported',
            provider,
            master_id: 'master',
          },
        },
      });
      expect(isProviderRecurrenceReadonly(projected)).toBe(true);
      expect(original).toEqual({ id: 'instance', summary: 'Private title' });
    }
  );
  it.each([
    null,
    {},
    {
      __tuturuuuProviderReadonlyRecurrence: {
        state: 'unsupported',
        provider: 'foreign',
        master_id: 'master',
      },
    },
  ])('ignores malformed markers', (value) =>
    expect(providerReadonlyProjection(value)).toEqual({})
  );
  it('does not classify an ordinary locked event as provider readonly', () =>
    expect(isProviderRecurrenceReadonly({ locked: true })).toBe(false));
});
