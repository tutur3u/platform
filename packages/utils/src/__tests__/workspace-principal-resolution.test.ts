import { expect, it, vi } from 'vitest';

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
}));

import {
  resolveWorkspaceIdForPrincipal,
  WorkspaceNotFoundError,
  WorkspaceResolutionError,
} from '../workspace-helper';

it.each([
  { error: null, Expected: WorkspaceNotFoundError },
  { error: { message: 'unavailable' }, Expected: WorkspaceResolutionError },
])(
  'distinguishes a missing personal workspace from a database lookup failure (%s)',
  async ({ error, Expected }) => {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error }),
    };
    const db = { from: () => query };
    await expect(
      resolveWorkspaceIdForPrincipal({
        authorizationClient: db as never,
        principal: { id: 'actor', email: null },
        wsId: 'personal',
      })
    ).rejects.toBeInstanceOf(Expected);
  }
);
