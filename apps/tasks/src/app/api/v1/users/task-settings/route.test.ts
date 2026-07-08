import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  resolveAuthenticatedSessionUser: vi.fn(),
  supabase: { from: vi.fn() },
  user: { id: 'user-1' },
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createClient: mocks.createClient,
}));

vi.mock('@/lib/app-session-user', () => ({
  resolveAuthenticatedSessionUser: mocks.resolveAuthenticatedSessionUser,
}));

function createTaskSettingsQuery({
  data,
  error = null,
}: {
  data: {
    task_auto_assign_to_self?: boolean | null;
    fade_completed_tasks?: boolean | null;
  } | null;
  error?: unknown;
}) {
  const query = {
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data, error })),
    select: vi.fn(() => query),
    update: vi.fn(() => query),
  };

  return query;
}

function taskSettingsRequest(body: unknown) {
  return new NextRequest(
    'https://tasks.tuturuuu.com/api/v1/users/task-settings',
    {
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
      method: 'PATCH',
    }
  );
}

describe('task settings route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue(mocks.supabase);
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      authError: null,
      user: mocks.user,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns stored task settings', async () => {
    const query = createTaskSettingsQuery({
      data: {
        fade_completed_tasks: false,
        task_auto_assign_to_self: true,
      },
    });
    mocks.supabase.from.mockReturnValue(query);

    const { GET } = await import('./route');
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe(
      'private, max-age=60, stale-while-revalidate=30'
    );
    await expect(response.json()).resolves.toEqual({
      fade_completed_tasks: false,
      task_auto_assign_to_self: true,
    });
    expect(mocks.supabase.from).toHaveBeenCalledWith('user_private_details');
    expect(query.select).toHaveBeenCalledWith(
      'task_auto_assign_to_self, fade_completed_tasks'
    );
    expect(query.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(query.maybeSingle).toHaveBeenCalled();
  });

  it('returns default task settings when the private details row is missing', async () => {
    const query = createTaskSettingsQuery({ data: null });
    mocks.supabase.from.mockReturnValue(query);

    const { GET } = await import('./route');
    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      fade_completed_tasks: false,
      task_auto_assign_to_self: false,
    });
  });

  it('keeps real read errors as failures', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const query = createTaskSettingsQuery({
      data: null,
      error: { message: 'database unavailable' },
    });
    mocks.supabase.from.mockReturnValue(query);

    const { GET } = await import('./route');
    const response = await GET();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Failed to fetch user task settings',
    });
    expect(errorSpy).toHaveBeenCalledWith(
      'Error fetching user task settings:',
      { message: 'database unavailable' }
    );
  });

  it('returns current settings without writing when PATCH has no setting fields', async () => {
    const query = createTaskSettingsQuery({
      data: {
        fade_completed_tasks: true,
        task_auto_assign_to_self: false,
      },
    });
    mocks.supabase.from.mockReturnValue(query);

    const { PATCH } = await import('./route');
    const response = await PATCH(taskSettingsRequest({}));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      fade_completed_tasks: true,
      task_auto_assign_to_self: false,
    });
    expect(query.update).not.toHaveBeenCalled();
  });

  it('updates task settings and returns the normalized updated row', async () => {
    const query = createTaskSettingsQuery({
      data: {
        fade_completed_tasks: true,
        task_auto_assign_to_self: true,
      },
    });
    mocks.supabase.from.mockReturnValue(query);

    const { PATCH } = await import('./route');
    const response = await PATCH(
      taskSettingsRequest({
        fade_completed_tasks: true,
        task_auto_assign_to_self: true,
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      fade_completed_tasks: true,
      task_auto_assign_to_self: true,
    });
    expect(query.update).toHaveBeenCalledWith({
      fade_completed_tasks: true,
      task_auto_assign_to_self: true,
    });
    expect(query.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(query.maybeSingle).toHaveBeenCalled();
  });

  it('does not fail PATCH when the private details row is missing', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const query = createTaskSettingsQuery({ data: null });
    mocks.supabase.from.mockReturnValue(query);

    const { PATCH } = await import('./route');
    const response = await PATCH(
      taskSettingsRequest({ fade_completed_tasks: true })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      fade_completed_tasks: true,
      task_auto_assign_to_self: false,
    });
    expect(warnSpy).toHaveBeenCalledWith(
      'User private details row missing while updating task settings'
    );
  });
});
