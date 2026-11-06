import type { TypedSupabaseClient } from '@tuturuuu/supabase';
import { describe, expect, it, vi } from 'vitest';
import type { SessionRecord } from '../schemas';
import { handleResumeAction } from './resume';

function session(tags: string[] | null): SessionRecord {
  return {
    id: 'parent',
    ws_id: 'workspace',
    user_id: 'user',
    title: 'Focus',
    task_id: 'task',
    tags,
    is_running: false,
    was_resumed: false,
    parent_session_id: null,
    start_time: '2026-10-27T02:00:00Z',
    end_time: '2026-10-27T02:25:00Z',
    category_id: null,
    created_at: null,
    updated_at: null,
    date: null,
    description: null,
    duration_seconds: 1500,
    pending_approval: false,
    productivity_score: null,
  };
}

describe('resuming session tags', () => {
  it.each([
    { tags: ['pomodoro'] },
    { tags: ['pomodoro', 'deep-work'] },
    { tags: null },
  ])('keeps parent tags $tags on the resumed session', async ({ tags }) => {
    const parent = session(tags);
    let values: Partial<SessionRecord> = {};
    const breaks = {
      select: vi.fn(() => breaks),
      eq: vi.fn(() => breaks),
      is: vi.fn(() => breaks),
      order: vi.fn(() => breaks),
      limit: vi.fn(() => breaks),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    };
    const sessions = {
      insert: vi.fn((rows: Partial<SessionRecord>[]) => {
        values = rows[0] ?? {};
        return sessions;
      }),
      select: vi.fn(() => sessions),
      single: vi.fn(async () => ({
        data: {
          ...parent,
          ...values,
          tags: values.tags ?? null,
          id: 'resumed',
        },
        error: null,
      })),
    };
    const client = {
      from: vi.fn((table: string) =>
        table === 'time_tracking_breaks' ? breaks : sessions
      ),
    };
    const response = await handleResumeAction({
      sbAdmin: client as unknown as TypedSupabaseClient,
      session: parent,
      sessionId: parent.id,
      normalizedWsId: parent.ws_id,
      userId: parent.user_id,
    });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.session.tags).toEqual(tags ?? []);
    expect(values.tags).toEqual(tags ?? []);
    expect(values.parent_session_id).toBe(parent.id);
  });
});
