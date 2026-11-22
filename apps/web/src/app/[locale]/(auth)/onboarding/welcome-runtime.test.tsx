import { isValidElement, type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn().mockResolvedValue(undefined),
}));

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getUserDefaultWorkspace: vi.fn(),
  getUserOnboardingProgress: vi.fn(),
  preferenceRows: [] as Array<{ enabled: boolean }>,
}));

vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));
vi.mock('@tuturuuu/utils/user-helper', () => ({
  getCurrentUser: mocks.getCurrentUser,
  getUserDefaultWorkspace: mocks.getUserDefaultWorkspace,
}));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: async () => {
    const query: Record<string, unknown> = {};
    for (const method of ['select', 'is', 'eq']) query[method] = () => query;
    query.then = (resolve: (value: unknown) => void) =>
      resolve({ data: mocks.preferenceRows });
    return { from: () => query };
  },
}));
vi.mock('./actions', () => ({
  getUserOnboardingProgress: mocks.getUserOnboardingProgress,
}));
vi.mock('./welcome-flow', () => ({ WelcomeFlow: () => null }));
vi.mock('@/lib/calendar-app-url', () => ({
  getCalendarAppOrigin: () => 'https://calendar.test',
}));
vi.mock('@/lib/tasks-app-url', () => ({
  getTasksAppOrigin: () => 'https://tasks.test',
}));

const USER = {
  avatar_url: null,
  display_name: ' Lan Nguyen ',
  id: 'user-1',
};

async function run(searchParams: Record<string, string> = {}) {
  const { WelcomeRuntime } = await import('./welcome-runtime');
  return WelcomeRuntime({ searchParams: Promise.resolve(searchParams) });
}

describe('/onboarding gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.preferenceRows = [];
    mocks.getCurrentUser.mockResolvedValue(USER);
    mocks.getUserOnboardingProgress.mockResolvedValue(null);
    mocks.getUserDefaultWorkspace.mockResolvedValue({
      id: 'ws-1',
      personal: true,
    });
  });

  it('sends a signed-out visitor to sign in', async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    await expect(run()).rejects.toThrow('redirect:/login');
    expect(mocks.getUserOnboardingProgress).not.toHaveBeenCalled();
  });

  it('renders the welcome flow when it is neither completed nor skipped', async () => {
    const result = (await run()) as ReactElement<Record<string, unknown>>;
    expect(isValidElement(result)).toBe(true);
    expect(result.props).toMatchObject({
      calendarOrigin: 'https://calendar.test',
      displayName: 'Lan Nguyen',
      hasProductNewsRow: false,
      initialProductNews: false,
      initialStep: 'profile',
      tasksOrigin: 'https://tasks.test',
    });
  });

  it('resumes the step a language switch asked for', async () => {
    const result = (await run({ step: 'space' })) as ReactElement<
      Record<string, unknown>
    >;
    expect(result.props.initialStep).toBe('space');
    const fallback = (await run({ step: 'nonsense' })) as ReactElement<
      Record<string, unknown>
    >;
    expect(fallback.props.initialStep).toBe('profile');
  });

  it('sends a completed user to their workspace', async () => {
    mocks.getUserOnboardingProgress.mockResolvedValue({
      completed_at: '2026-11-20T00:00:00Z',
    });
    await expect(run()).rejects.toThrow('redirect:/personal');
  });

  it('sends a user who skipped to their workspace', async () => {
    mocks.getUserOnboardingProgress.mockResolvedValue({
      dismissed_at: '2026-11-20T00:00:00Z',
    });
    await expect(run()).rejects.toThrow('redirect:/personal');
  });

  it('replays the flow for a finished user when asked from Settings', async () => {
    mocks.getUserOnboardingProgress.mockResolvedValue({
      completed_at: '2026-11-20T00:00:00Z',
    });
    const result = (await run({ replay: '1' })) as ReactElement;
    expect(isValidElement(result)).toBe(true);
  });

  it('starts the product news switch off unless an explicit opt-in exists', async () => {
    mocks.preferenceRows = [{ enabled: false }];
    const off = (await run()) as ReactElement<Record<string, unknown>>;
    expect(off.props).toMatchObject({
      hasProductNewsRow: true,
      initialProductNews: false,
    });

    mocks.preferenceRows = [{ enabled: true }];
    const on = (await run()) as ReactElement<Record<string, unknown>>;
    expect(on.props).toMatchObject({
      hasProductNewsRow: true,
      initialProductNews: true,
    });
  });
});
