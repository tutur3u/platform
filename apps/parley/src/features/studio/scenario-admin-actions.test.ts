import { beforeEach, expect, it, vi } from 'vitest';
import { z } from 'zod';

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

const initialState = { status: 'idle', errors: {} } as const;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.authorize.mockResolvedValue({ id: 'admin-id' });
});

it('does not write scenarios when current Parley administrator access fails', async () => {
  mocks.authorize.mockRejectedValue(new Error('Forbidden'));
  await expect(
    saveStudioScenario(initialState, new FormData())
  ).rejects.toThrow('Forbidden');
  expect(mocks.persist).not.toHaveBeenCalled();
});

it('saves with the authenticated actor and refreshes management and discovery', async () => {
  const form = new FormData();
  await expect(saveStudioScenario(initialState, form)).resolves.toEqual({
    status: 'saved',
    errors: {},
  });
  expect(mocks.persist).toHaveBeenCalledWith(form, 'admin-id');
  expect(mocks.revalidate.mock.calls.map(([path]) => path)).toEqual([
    '/manage/scenarios',
    '/',
    '/sessions/new',
  ]);
});

it('returns field errors without invalidating any page for invalid input', async () => {
  let validationError: unknown;
  try {
    z.object({ title: z.string().trim().min(1) }).parse({ title: ' ' });
  } catch (error) {
    validationError = error;
  }
  mocks.persist.mockRejectedValue(validationError);
  await expect(
    saveStudioScenario(initialState, new FormData())
  ).resolves.toEqual({ status: 'invalid', errors: { title: true } });
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
