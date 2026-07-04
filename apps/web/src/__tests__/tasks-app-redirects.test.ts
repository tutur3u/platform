import { redirect } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

const redirectMock = vi.mocked(redirect);

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  process.env.TASKS_APP_URL = 'https://tasks.example.com';
});

describe('tasks app redirects', () => {
  it('redirects old web task routes to the tasks app with query parameters', async () => {
    const { default: TasksRedirectPage } = await import(
      '@/app/[locale]/(dashboard)/[wsId]/tasks/[[...slug]]/page'
    );

    await TasksRedirectPage({
      params: Promise.resolve({
        locale: 'en',
        slug: ['task-1'],
        wsId: 'ws-1',
      }),
      searchParams: Promise.resolve({
        filter: ['open', 'mine'],
        tab: 'activity',
      }),
    });

    expect(redirectMock).toHaveBeenCalledWith(
      'https://tasks.example.com/en/ws-1/tasks/task-1?filter=open&filter=mine&tab=activity'
    );
  });

  it('maps old standalone task sections to first-class tasks app routes', async () => {
    const { default: TasksRedirectPage } = await import(
      '@/app/[locale]/(dashboard)/[wsId]/tasks/[[...slug]]/page'
    );

    await TasksRedirectPage({
      params: Promise.resolve({
        locale: 'en',
        slug: ['boards', 'board-1'],
        wsId: 'ws-1',
      }),
      searchParams: Promise.resolve({ view: 'kanban' }),
    });

    expect(redirectMock).toHaveBeenCalledWith(
      'https://tasks.example.com/en/ws-1/boards/board-1?view=kanban'
    );
  });

  it('redirects old habit routes to the tasks app habit surface', async () => {
    const { default: HabitsRedirectPage } = await import(
      '@/app/[locale]/(dashboard)/[wsId]/habits/[[...slug]]/page'
    );

    await HabitsRedirectPage({
      params: Promise.resolve({
        locale: 'vi',
        slug: ['tracker-1'],
        wsId: 'personal',
      }),
      searchParams: Promise.resolve({ scope: 'team' }),
    });

    expect(redirectMock).toHaveBeenCalledWith(
      'https://tasks.example.com/vi/personal/habits/tracker-1?scope=team'
    );
  });

  it('redirects public shared task URLs to the tasks app', async () => {
    const { default: SharedTaskPage } = await import(
      '@/app/[locale]/shared/task/[shareCode]/page'
    );

    await SharedTaskPage({
      params: Promise.resolve({ locale: 'en', shareCode: 'share/code' }),
      searchParams: Promise.resolve({ utm_source: 'mail' }),
    });

    expect(redirectMock).toHaveBeenCalledWith(
      'https://tasks.example.com/en/shared/task/share%2Fcode?utm_source=mail'
    );
  });

  it('redirects public shared task board URLs to the tasks app', async () => {
    const { default: PublicTaskBoardPage } = await import(
      '@/app/[locale]/shared/task-boards/[code]/page'
    );

    await PublicTaskBoardPage({
      params: Promise.resolve({ code: 'board code', locale: 'vi' }),
      searchParams: Promise.resolve({ from: ['mail', 'push'] }),
    });

    expect(redirectMock).toHaveBeenCalledWith(
      'https://tasks.example.com/vi/shared/task-boards/board%20code?from=mail&from=push'
    );
  });
});
