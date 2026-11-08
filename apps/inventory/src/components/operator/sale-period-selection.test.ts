import { describe, expect, it } from 'vitest';
import { rememberSalePeriod, resolveSalePeriod } from './sale-period-selection';

function setup() {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
  const input = {
    wsId: 'workspace-a',
    actorId: 'actor-a',
    current: null,
    periods: [{ id: 'booth', status: 'active' }],
    fallback: 'choose',
    storage,
  };
  return { input, storage };
}

describe('sale period selection', () => {
  it('retains a manually chosen period across consecutive resets and remounts', () => {
    const { input, storage } = setup();
    rememberSalePeriod({ ...input, id: 'booth' }, storage);
    expect(resolveSalePeriod(input)).toBe('booth');
    expect(resolveSalePeriod({ ...input, fallback: 'different-default' })).toBe(
      'booth'
    );
    expect(resolveSalePeriod(input)).toBe('booth');
  });

  it('isolates both workspace and actor, including in-memory state', () => {
    const { input, storage } = setup();
    const current = { ...input, id: 'booth' };
    rememberSalePeriod(current, storage);
    expect(resolveSalePeriod({ ...input, wsId: 'other', current })).toBe(
      'choose'
    );
    expect(resolveSalePeriod({ ...input, actorId: 'other', current })).toBe(
      'choose'
    );
  });

  it('retains an explicit no-period choice instead of applying the default', () => {
    const { input, storage } = setup();
    rememberSalePeriod({ ...input, id: 'none' }, storage);
    expect(resolveSalePeriod({ ...input, fallback: 'booth' })).toBe('none');
  });

  it('does not select archived or deleted remembered periods', () => {
    const { input, storage } = setup();
    rememberSalePeriod({ ...input, id: 'booth' }, storage);
    expect(resolveSalePeriod({ ...input, periods: [] })).toBe('choose');
    expect(
      resolveSalePeriod({
        ...input,
        periods: [{ id: 'booth', status: 'archived' }],
      })
    ).toBe('choose');
  });

  it('keeps consecutive sales usable when local storage is unavailable', () => {
    const { input } = setup();
    const storage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const current = { ...input, id: 'booth' };
    expect(() => rememberSalePeriod(current, storage)).not.toThrow();
    expect(resolveSalePeriod({ ...input, current, storage })).toBe('booth');
    expect(resolveSalePeriod({ ...input, storage })).toBe('choose');
  });
});
