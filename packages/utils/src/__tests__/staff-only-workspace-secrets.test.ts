import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  isStaffOnlyWorkspaceSecretName as isStaffOnly,
  STAFF_ONLY_WORKSPACE_SECRETS as LIST,
} from '../staff-only-workspace-secrets';

const DIR = resolve(__dirname, '../../../../apps/database/supabase/migrations');
const GUARD =
  /FUNCTION public\.guard_workspace_reserved_secrets\(\)\s+RETURNS/i;

describe('staff-only workspace secrets', () => {
  // biome-ignore format: dense parity check
  it('is one list, equal to the newest guard_workspace_reserved_secrets() array', () => {
    const files = readdirSync(DIR).filter((file) => file.endsWith('.sql')).sort();
    const sql = files.map((file) => readFileSync(resolve(DIR, file), 'utf8')).filter((text) => GUARD.test(text)).at(-1);
    const array = sql?.match(/v_reserved constant text\[\] := ARRAY\[([^\]]*)\]/)?.[1] ?? '';
    const reserved = [...array.matchAll(/'([A-Z0-9_]+)'/g)].map((m) => m[1]);
    expect([...LIST].sort()).toEqual(['ENABLE_BOARD_CYCLES', 'ENABLE_FEE_LOCK', 'MANAGED_CRON_ENABLED']);
    expect(reserved.sort()).toEqual([...LIST].sort());
  });

  // biome-ignore format: compact cases
  it('matches names however they are cased or padded, and nothing else', () => {
    for (const name of [...LIST, ' managed_cron_enabled ', ' enable_board_cycles ', ' enable_fee_lock ']) {
      expect(isStaffOnly(name)).toBe(true);
    }
    for (const name of ['ENABLE_TASKS', 'ENABLE_BOARD_CYCLES_X', 'ENABLE_FEE_LOCKS', '', null, undefined]) {
      expect(isStaffOnly(name)).toBe(false);
    }
  });
});
