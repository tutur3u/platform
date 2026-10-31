import { describe, expect, it, vi } from 'vitest';
import {
  createTutoringSession,
  deleteTutoringSession,
  endTutoringWeakSupport,
  exportTutoringSessions,
  generateTutoringMessagePreview,
  getTutoringPolicy,
  listTutoringQueue,
  listTutoringSessions,
  listTutoringTeachers,
  markTutoringSession,
  updateTutoringPolicy,
  updateTutoringSession,
} from './tutoring';
import type { TutoringPolicy } from './tutoring-policy';

const BASE = 'https://internal.example.com';

function setup(payload: unknown = {}) {
  const fetchMock = vi.fn().mockResolvedValue({
    headers: new Headers(),
    json: async () => payload,
    ok: true,
    status: 200,
  });
  return {
    fetchMock,
    options: {
      baseUrl: BASE,
      fetch: fetchMock as unknown as typeof fetch,
    },
  };
}

function call(fetchMock: ReturnType<typeof vi.fn>) {
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return {
    body: init.body ? JSON.parse(String(init.body)) : undefined,
    cache: init.cache,
    contentType: new Headers(init.headers).get('content-type'),
    method: init.method ?? 'GET',
    url,
  };
}

describe('tutoring internal-api helpers', () => {
  it('reads the policy without caching, under the encoded workspace', async () => {
    const { fetchMock, options } = setup({ isConfigured: true, policy: {} });

    await expect(getTutoringPolicy('ws 1/x', options)).resolves.toEqual({
      isConfigured: true,
      policy: {},
    });

    expect(call(fetchMock)).toMatchObject({
      cache: 'no-store',
      method: 'GET',
      url: `${BASE}/api/v1/workspaces/ws%201%2Fx/tutoring/policy`,
    });
  });

  it('saves the policy with a JSON PUT', async () => {
    const { fetchMock, options } = setup({ policy: {} });
    const policy = { durationMinutes: 45 } as unknown as TutoringPolicy;

    await updateTutoringPolicy('ws-1', policy, options);

    expect(call(fetchMock)).toMatchObject({
      body: policy,
      contentType: 'application/json',
      method: 'PUT',
      url: `${BASE}/api/v1/workspaces/ws-1/tutoring/policy`,
    });
  });

  it('lists sessions with filters as query params and skips unset ones', async () => {
    const { fetchMock, options } = setup({ data: [] });

    await listTutoringSessions(
      'ws-1',
      {
        attendanceStatus: 'DONE',
        fromDate: '2026-10-01',
        page: 2,
        pageSize: 25,
        sortOrder: 'asc',
        teacherId: undefined,
      },
      options
    );

    const { cache, url } = call(fetchMock);
    const parsed = new URL(url);
    expect(parsed.pathname).toBe('/api/v1/workspaces/ws-1/tutoring/sessions');
    expect(Object.fromEntries(parsed.searchParams)).toEqual({
      attendanceStatus: 'DONE',
      fromDate: '2026-10-01',
      page: '2',
      pageSize: '25',
      sortOrder: 'asc',
    });
    expect(cache).toBe('no-store');
  });

  it('lists sessions with no query string by default', async () => {
    const { fetchMock, options } = setup({ data: [] });

    await listTutoringSessions('ws-1', undefined, options);

    expect(call(fetchMock).url).toBe(
      `${BASE}/api/v1/workspaces/ws-1/tutoring/sessions`
    );
  });

  it('creates several learners sharing one teacher slot in a single POST', async () => {
    const { fetchMock, options } = setup({
      createdCount: 1,
      id: 'a',
      ids: ['a'],
    });
    const payload = {
      groupId: 'group-1',
      reasonType: 'ABSENT_RECOVERY' as const,
      sessions: [
        {
          durationMinutes: 45,
          sessionDate: '2026-10-05',
          startTime: '17:30',
          teacherUserId: 'teacher-1',
        },
      ],
      studentUserId: 'student-1',
    };

    await expect(
      createTutoringSession('ws-1', payload, options)
    ).resolves.toMatchObject({ createdCount: 1 });

    expect(call(fetchMock)).toMatchObject({
      body: payload,
      contentType: 'application/json',
      method: 'POST',
      url: `${BASE}/api/v1/workspaces/ws-1/tutoring/sessions`,
    });
  });

  it('updates and deletes one session by encoded id', async () => {
    const update = setup({ message: 'ok' });
    await updateTutoringSession(
      'ws-1',
      'session/1',
      { attendanceStatus: 'NO_SHOW', durationMinutes: 60 },
      update.options
    );
    expect(call(update.fetchMock)).toMatchObject({
      body: { attendanceStatus: 'NO_SHOW', durationMinutes: 60 },
      method: 'PUT',
      url: `${BASE}/api/v1/workspaces/ws-1/tutoring/sessions/session%2F1`,
    });

    const remove = setup({ message: 'ok' });
    await deleteTutoringSession('ws-1', 'session/1', remove.options);
    expect(call(remove.fetchMock)).toMatchObject({
      body: undefined,
      method: 'DELETE',
      url: `${BASE}/api/v1/workspaces/ws-1/tutoring/sessions/session%2F1`,
    });
  });

  it('marks a session and surfaces the linked-content warning', async () => {
    const { fetchMock, options } = setup({
      message: 'done',
      warning: 'LINKED_CONTENT_NOT_STORED',
    });

    await expect(
      markTutoringSession('ws-1', 's-1', 'DONE', options)
    ).resolves.toEqual({
      message: 'done',
      warning: 'LINKED_CONTENT_NOT_STORED',
    });

    expect(call(fetchMock)).toMatchObject({
      body: { attendanceStatus: 'DONE' },
      method: 'POST',
      url: `${BASE}/api/v1/workspaces/ws-1/tutoring/sessions/s-1/mark`,
    });
  });

  it('ends weak support for one learner in one class', async () => {
    const { fetchMock, options } = setup({ cleared: 2, message: 'ok' });
    const payload = { groupId: 'g-1', studentUserId: 'u-1' };

    await expect(
      endTutoringWeakSupport('ws-1', payload, options)
    ).resolves.toEqual({ cleared: 2, message: 'ok' });

    expect(call(fetchMock)).toMatchObject({
      body: payload,
      method: 'POST',
      url: `${BASE}/api/v1/workspaces/ws-1/tutoring/weak-support/end`,
    });
  });

  it('requests a parent message preview for the encoded session', async () => {
    const { fetchMock, options } = setup({ preview: 'Hello' });

    await expect(
      generateTutoringMessagePreview('ws-1', 'a/b', options)
    ).resolves.toEqual({ preview: 'Hello' });

    expect(call(fetchMock)).toMatchObject({
      method: 'POST',
      url: `${BASE}/api/v1/workspaces/ws-1/tutoring/sessions/a%2Fb/message-preview`,
    });
  });

  it('pages the queue with search text', async () => {
    const { fetchMock, options } = setup({ data: [] });

    await listTutoringQueue(
      'ws-1',
      { page: 3, pageSize: 10, q: 'an nguyen' },
      options
    );

    const { cache, url } = call(fetchMock);
    const parsed = new URL(url);
    expect(parsed.pathname).toBe('/api/v1/workspaces/ws-1/tutoring/queue');
    expect(Object.fromEntries(parsed.searchParams)).toEqual({
      page: '3',
      pageSize: '10',
      q: 'an nguyen',
    });
    expect(cache).toBe('no-store');
  });

  it('exports payroll rows with total cong, keeping the fraction', async () => {
    const payroll = {
      data: [
        {
          completed_sessions: 1,
          teacher_name: 'Teacher',
          total_cong: 60 / 45,
          total_minutes: 60,
        },
      ],
      mode: 'payroll' as const,
    };
    const { fetchMock, options } = setup(payroll);

    const result = await exportTutoringSessions(
      'ws-1',
      { mode: 'payroll', teacherId: 'teacher-1' },
      options
    );

    expect(result).toEqual(payroll);
    if (result.mode === 'payroll') {
      expect(result.data[0]?.total_cong).toBeCloseTo(1.33, 2);
    }
    const { cache, url } = call(fetchMock);
    expect(Object.fromEntries(new URL(url).searchParams)).toEqual({
      mode: 'payroll',
      teacherId: 'teacher-1',
    });
    expect(cache).toBe('no-store');
  });

  it('lists teachers, passing the tutors-only flag', async () => {
    const { fetchMock, options } = setup({ data: [] });

    await listTutoringTeachers(
      'ws-1',
      { page: 1, q: 'lan', tutorsOnly: true },
      options
    );

    const { url } = call(fetchMock);
    const parsed = new URL(url);
    expect(parsed.pathname).toBe('/api/v1/workspaces/ws-1/tutoring/teachers');
    expect(Object.fromEntries(parsed.searchParams)).toEqual({
      page: '1',
      q: 'lan',
      tutorsOnly: 'true',
    });
  });
});
