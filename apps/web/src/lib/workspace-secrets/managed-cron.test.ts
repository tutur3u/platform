// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/supabase/next/server', () => ({}));
vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({}));
vi.mock('@tuturuuu/supabase/next/user', () => ({}));

import { isManagedCronEnableSecretName } from './managed-cron';

describe('staff-only workspace secret names', () => {
  it.each([
    'MANAGED_CRON_ENABLED',
    ' managed_cron_enabled ',
    'ENABLE_BOARD_CYCLES',
    ' enable_board_cycles ',
  ])('reserves %j for verified staff', (name) => {
    expect(isManagedCronEnableSecretName(name)).toBe(true);
  });

  it.each(['ENABLE_TASKS', 'ENABLE_BOARD_CYCLES_X', '', null, undefined])(
    'leaves %j to workspace secret managers',
    (name) => {
      expect(isManagedCronEnableSecretName(name)).toBe(false);
    }
  );
});
