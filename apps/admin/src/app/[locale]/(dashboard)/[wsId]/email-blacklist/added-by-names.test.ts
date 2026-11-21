import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  resolveCoMemberNames: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('@tuturuuu/utils/co-member-names', () => ({
  resolveCoMemberNames: mocks.resolveCoMemberNames,
}));

import { withAddedByNames } from './added-by-names';

const WS_ID = '00000000-0000-4000-8000-000000003131';
const VIEWER_ID = '00000000-0000-4000-8000-000000003132';
const AUTHOR_ID = '00000000-0000-4000-8000-000000003133';
const ADMIN = { name: 'admin-client' };

function entry(displayName: string | null) {
  return {
    added_by_user_id: AUTHOR_ID,
    id: 'entry-1',
    users: { display_name: displayName, handle: 'author', id: AUTHOR_ID },
    value: 'blocked@spam.test',
  };
}

describe('email blacklist added-by names', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAdminClient.mockResolvedValue(ADMIN);
  });

  it('names a nameless co-member author by email for a member viewer', async () => {
    mocks.resolveCoMemberNames.mockResolvedValue(
      new Map([[AUTHOR_ID, 'author@example.com']])
    );

    const [row] = await withAddedByNames({
      rows: [entry(null)],
      viewerUserId: VIEWER_ID,
      wsId: WS_ID,
    });

    expect(row?.users?.display_name).toBe('author@example.com');
    expect(row?.users).not.toHaveProperty('email');
    expect(mocks.resolveCoMemberNames).toHaveBeenCalledWith(
      expect.objectContaining({
        admin: ADMIN,
        viewerUserId: VIEWER_ID,
        wsId: WS_ID,
      })
    );
  });

  it('falls back to the handle when the helper withholds the email (HIDE_MEMBER_EMAIL)', async () => {
    mocks.resolveCoMemberNames.mockResolvedValue(
      new Map([[AUTHOR_ID, 'author']])
    );

    const [row] = await withAddedByNames({
      rows: [entry(null)],
      viewerUserId: VIEWER_ID,
      wsId: WS_ID,
    });

    expect(row?.users?.display_name).toBe('author');
    expect(JSON.stringify(row)).not.toContain('@example.com');
  });

  it('passes a missing viewer through so the helper fails closed', async () => {
    mocks.resolveCoMemberNames.mockResolvedValue(
      new Map([[AUTHOR_ID, 'author']])
    );

    await withAddedByNames({
      rows: [entry(null)],
      viewerUserId: null,
      wsId: WS_ID,
    });

    expect(mocks.resolveCoMemberNames).toHaveBeenCalledWith(
      expect.objectContaining({ viewerUserId: null, wsId: WS_ID })
    );
  });

  it('skips the lookup when every author already has a display name', async () => {
    const rows = [entry('Named Author'), { id: 'entry-2', users: null }];

    const result = await withAddedByNames({
      rows,
      viewerUserId: VIEWER_ID,
      wsId: WS_ID,
    });

    expect(result).toBe(rows);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
});
