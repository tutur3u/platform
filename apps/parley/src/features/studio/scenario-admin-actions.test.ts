import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  persist: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock('@tuturuuu/meet-core/parley/authorization', () => ({
  requireParleyStudioAdministrator: mocks.authorize,
}));
vi.mock('@tuturuuu/meet-core/parley/scenario-mutations', () => ({
  persistParleyScenario: mocks.persist,
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));

import { saveStudioScenario } from './scenario-admin-actions';

beforeEach(() => {
  vi.resetAllMocks();
  mocks.authorize.mockResolvedValue({ id: 'admin-id' });
});

it('does not write scenarios when current Parley administrator access fails', async () => {
  mocks.authorize.mockRejectedValue(new Error('Forbidden'));
  await expect(saveStudioScenario(new FormData())).rejects.toThrow('Forbidden');
  expect(mocks.persist).not.toHaveBeenCalled();
});

it('saves with the authenticated actor and refreshes management and discovery', async () => {
  const form = new FormData();
  await saveStudioScenario(form);
  expect(mocks.persist).toHaveBeenCalledWith(form, 'admin-id');
  expect(mocks.revalidate.mock.calls.map(([path]) => path)).toEqual([
    '/manage/scenarios',
    '/',
    '/sessions/new',
  ]);
});
