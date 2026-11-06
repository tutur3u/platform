import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { describe, expect, it, vi } from 'vitest';
import {
  ENABLE_TUTORING_CONFIG_ID,
  isTutoringConfigEnabled,
  readTutoringModuleEnabled,
} from './tutoring-module';

function dbMock({
  configError = null,
  configValue = null,
  personal = false,
  workspaceError = null,
}: {
  configError?: unknown;
  configValue?: string | null;
  personal?: boolean | null;
  workspaceError?: unknown;
}) {
  const eqs: [string, unknown][] = [];
  const db = {
    from(table: string) {
      const builder = {
        eq: (column: string, value: unknown) => {
          eqs.push([`${table}.${column}`, value]);
          return builder;
        },
        maybeSingle: async () =>
          table === 'workspaces'
            ? {
                data: personal === null ? null : { personal },
                error: workspaceError,
              }
            : {
                data: configValue === null ? null : { value: configValue },
                error: configError,
              },
        select: () => builder,
      };
      return builder;
    },
  } as unknown as TypedSupabaseClient;
  return { db, eqs };
}

describe('isTutoringConfigEnabled (same rule as the Contacts feature gate)', () => {
  it.each([
    [{ isPersonal: false, value: undefined }, true],
    [{ isPersonal: false, value: 'true' }, true],
    [{ isPersonal: false, value: ' FALSE ' }, false],
    [{ isPersonal: true, value: null }, false],
    [{ isPersonal: true, value: 'True' }, true],
    [{ isPersonal: true, value: 'false' }, false],
  ])('%j -> %s', (input, expected) => {
    expect(isTutoringConfigEnabled(input)).toBe(expected);
  });
});

describe('readTutoringModuleEnabled', () => {
  it('reads the toggle from workspace_configs for the workspace', async () => {
    const { db, eqs } = dbMock({ configValue: 'true' });

    expect(await readTutoringModuleEnabled(db, 'ws-1')).toBe(true);
    expect(eqs).toContainEqual(['workspace_configs.ws_id', 'ws-1']);
    expect(eqs).toContainEqual(['workspace_configs.id', 'ENABLE_TUTORING']);
  });

  it('is off when the toggle is false and on for an unset shared workspace', async () => {
    expect(
      await readTutoringModuleEnabled(dbMock({ configValue: 'false' }).db, 'w')
    ).toBe(false);
    expect(await readTutoringModuleEnabled(dbMock({}).db, 'w')).toBe(true);
    expect(
      await readTutoringModuleEnabled(dbMock({ personal: true }).db, 'w')
    ).toBe(false);
  });

  it.each([
    ['the toggle read fails', { configError: { message: 'boom' } }],
    ['the workspace read fails', { workspaceError: { message: 'boom' } }],
    ['the workspace is missing', { personal: null }],
  ])('fails closed when %s', async (_name, state) => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await readTutoringModuleEnabled(dbMock(state).db, 'w')).toBe(false);
    logged.mockRestore();
  });
});

describe('ENABLE_TUTORING_CONFIG_ID', () => {
  it('matches the shared internal-api constant', () => {
    const source = readFileSync(
      resolve(__dirname, '../../../internal-api/src/workspace-config-ids.ts'),
      'utf8'
    );

    expect(source).toContain(
      `ENABLE_TUTORING_CONFIG_ID = '${ENABLE_TUTORING_CONFIG_ID}'`
    );
  });
});
