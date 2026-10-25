// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceNavigationLinks } from './navigation';

const mocks = vi.hoisted(() => ({
  permissions: vi.fn(),
  from: vi.fn(),
  staff: vi.fn(),
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: async () => ({ from: mocks.from }),
  createAdminClient: async () => ({}),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.permissions,
  getSecrets: async () => [],
  getSecret: () => undefined,
}));
vi.mock('next-intl/server', () => ({
  getLocale: async () => 'en',
  getTranslations: async () => (key: string) => key,
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('not_found');
  },
}));
vi.mock('@/lib/product-feedback-staff', () => ({
  getFeedbackStaffIdentity: mocks.staff,
}));
vi.mock('@tuturuuu/tasks-api/server/board-access', () => ({
  loadTaskBoardGuestSharesForWorkspace: async () => [],
  summarizeTaskBoardGuestShares: () => ({ boardCount: 0 }),
}));
function preferences() {
  const pending = Promise.withResolvers<{ data: null }>();
  const query = {
    select: () => query,
    eq: () => query,
    in: () => pending.promise,
    maybeSingle: () => pending.promise,
  };
  mocks.from.mockReturnValue(query);
  return pending;
}
const user = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'staff@tuturuuu.com',
};
const input = {
  wsId: '22222222-2222-4222-8222-222222222222',
  personalOrWsId: 'workspace',
  isPersonal: false,
  isTuturuuuUser: true,
  user,
};
afterEach(() => vi.resetAllMocks());
describe('feedback navigation admission and scheduling', () => {
  it('starts staff eligibility after permission admission while preferences are still pending', async () => {
    const permission = Promise.withResolvers<{
      withoutPermission: () => boolean;
    }>();
    mocks.permissions.mockReturnValue(permission.promise);
    mocks.staff.mockResolvedValue(user.id);
    const prefs = preferences();
    const navigation = WorkspaceNavigationLinks(input);
    await vi.waitFor(() => expect(mocks.permissions).toHaveBeenCalledOnce());
    expect(mocks.staff).not.toHaveBeenCalled();
    permission.resolve({ withoutPermission: () => false });
    try {
      await vi.waitFor(() => expect(mocks.staff).toHaveBeenCalledOnce());
    } finally {
      prefs.resolve({ data: null });
    }
    expect(await navigation).toContainEqual(
      expect.objectContaining({ id: 'product-feedback' })
    );
  });
  it('does not check staff identity for a denied workspace', async () => {
    mocks.permissions.mockResolvedValue(null);
    const prefs = preferences();
    prefs.resolve({ data: null });
    await expect(WorkspaceNavigationLinks(input)).rejects.toThrow('not_found');
    expect(mocks.staff).not.toHaveBeenCalled();
  });
  it('does not check staff identity for a non-corporate account with workspace permission', async () => {
    mocks.permissions.mockResolvedValue({ withoutPermission: () => false });
    const prefs = preferences();
    prefs.resolve({ data: null });
    const navigation = await WorkspaceNavigationLinks({
      ...input,
      user: { ...user, email: 'user@example.test' },
    });
    expect(mocks.staff).not.toHaveBeenCalled();
    expect(navigation).not.toContainEqual(
      expect.objectContaining({ id: 'product-feedback' })
    );
  });
});
