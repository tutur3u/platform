import { NextResponse } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  authorize: vi.fn(),
  from: vi.fn(),
  decrypt: vi.fn(),
  permission: false,
}));
vi.mock('@/lib/calendar-event-permission', () => ({
  authorizeCalendarEventManagement: m.authorize,
}));
vi.mock('@/lib/api-auth', () => ({
  resolveSessionAuthContext: async () => ({
    ok: true,
    user: { id: 'actor' },
    supabase: {},
  }),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  verifyWorkspaceMembershipType: async () => ({ ok: true }),
  getPermissions: async () => ({ containsPermission: () => m.permission }),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: async () => ({ from: m.from }),
}));
vi.mock('@/lib/workspace-encryption', () => ({
  decryptEventsFromStorage: m.decrypt,
}));
vi.mock('next/server', async (original) => ({
  ...(await original<typeof import('next/server')>()),
  connection: async () => {},
}));

import { GET } from './route';

describe('Mira calendar authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    m.permission = false;
    const q = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    m.from.mockReturnValue(q);
    m.decrypt.mockResolvedValue([]);
  });
  it('returns permission denial before reading or decrypting calendar events', async () => {
    m.authorize.mockResolvedValue({
      error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    });
    expect(
      (await GET(new Request('https://example.test/?wsId=workspace'))).status
    ).toBe(403);
    expect(m.from).not.toHaveBeenCalled();
    expect(m.decrypt).not.toHaveBeenCalled();
  });
  it('uses the canonical resolved workspace for permitted reads', async () => {
    m.permission = true;
    m.authorize.mockResolvedValue({
      wsId: 'resolved',
      userId: 'actor',
      sbAdmin: { from: m.from },
    });
    expect(
      (await GET(new Request('https://example.test/?wsId=personal'))).status
    ).toBe(200);
    expect(m.authorize).toHaveBeenCalledWith(expect.any(Request), 'personal');
    expect(m.from().eq).toHaveBeenCalledWith('ws_id', 'resolved');
  });
});
