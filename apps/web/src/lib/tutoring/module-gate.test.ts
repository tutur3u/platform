// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  configError: null as unknown,
  configValue: null as string | null,
  eqs: [] as [string, unknown][],
  personal: false as boolean | null,
  workspaceError: null as unknown,
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({
    from(table: string) {
      const builder = {
        eq: (column: string, value: unknown) => {
          state.eqs.push([`${table}.${column}`, value]);
          return builder;
        },
        maybeSingle: async () =>
          table === 'workspaces'
            ? {
                data:
                  state.personal === null ? null : { personal: state.personal },
                error: state.workspaceError,
              }
            : {
                data:
                  state.configValue === null
                    ? null
                    : { value: state.configValue },
                error: state.configError,
              },
        select: () => builder,
      };
      return builder;
    },
  }),
}));

const { isTutoringConfigEnabled, isTutoringEnabledForWorkspace } = await import(
  './module-gate'
);

beforeEach(() => {
  state.configError = null;
  state.configValue = null;
  state.eqs = [];
  state.personal = false;
  state.workspaceError = null;
});

describe('isTutoringConfigEnabled (same rule as the Contacts feature gate)', () => {
  it.each([
    [{ isPersonal: false, value: 'true' }, true],
    [{ isPersonal: false, value: ' TRUE ' }, true],
    [{ isPersonal: false, value: 'false' }, false],
    [{ isPersonal: false, value: ' False ' }, false],
    [{ isPersonal: false, value: null }, true],
    [{ isPersonal: false, value: undefined }, true],
    [{ isPersonal: false, value: '' }, true],
    [{ isPersonal: false, value: 'maybe' }, true],
    [{ isPersonal: true, value: 'true' }, true],
    [{ isPersonal: true, value: 'false' }, false],
    [{ isPersonal: true, value: null }, false],
  ])('%j -> %s', (input, expected) => {
    expect(isTutoringConfigEnabled(input)).toBe(expected);
  });
});

describe('isTutoringEnabledForWorkspace', () => {
  it('reads the ENABLE_TUTORING config of the workspace', async () => {
    state.configValue = 'false';

    await expect(isTutoringEnabledForWorkspace('ws-1')).resolves.toBe(false);
    expect(state.eqs).toContainEqual(['workspace_configs.ws_id', 'ws-1']);
    expect(state.eqs).toContainEqual([
      'workspace_configs.id',
      'ENABLE_TUTORING',
    ]);
  });

  it('defaults to on for a shared workspace and off for a personal one', async () => {
    await expect(isTutoringEnabledForWorkspace('ws-1')).resolves.toBe(true);

    state.personal = true;
    await expect(isTutoringEnabledForWorkspace('ws-1')).resolves.toBe(false);
  });

  it.each([
    ['config', { configError: { message: 'boom' } }],
    ['workspace', { workspaceError: { message: 'boom' } }],
    ['missing workspace', { personal: null }],
  ])('fails closed when the %s lookup fails', async (_label, patch) => {
    Object.assign(state, patch);
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(isTutoringEnabledForWorkspace('ws-1')).resolves.toBe(false);
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});
