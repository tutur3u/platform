import { createClient } from '@supabase/supabase-js';
import type { Database } from '@tuturuuu/types';
import { expect, it, vi } from 'vitest';
import { listLmsClassSchedule } from './lms-class-schedule';

const wsId = 'c7100000-0000-4000-8000-000000000001';
const classId = 'c7100000-0000-4000-8000-000000000002';
const contactId = 'c7100000-0000-4000-8000-000000000003';
const scheduleId = 'c7100000-0000-4000-8000-000000000004';
const from = '2026-11-01T00:00:00Z';
const to = '2026-12-01T00:00:00Z';
const startsAt = '2026-11-10T00:00:00.123456+00:00';
const updatedSince = '2026-11-08T00:00:00.456789Z';

function database() {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json([]));
  const db = createClient<Database>(
    'https://database.example.test',
    'test-key',
    {
      auth: { persistSession: false },
      global: { fetch },
    }
  );
  return { db, fetch };
}

it('checks the exact published class and learner membership before reading private schedule data', async () => {
  const { db, fetch } = database();
  const rows = await listLmsClassSchedule({
    db,
    wsId,
    classId,
    from,
    to,
    limit: 21,
    scope: { kind: 'student', contactId },
  });
  expect(rows).toBeNull();
  expect(fetch).toHaveBeenCalledTimes(1);
  const url = new URL(String(fetch.mock.calls[0]?.[0]));
  expect(url.pathname).toBe('/rest/v1/workspace_user_groups_users');
  expect(Object.fromEntries(url.searchParams)).toMatchObject({
    group_id: `eq.${classId}`,
    user_id: `eq.${contactId}`,
    role: 'eq.STUDENT',
    'group.ws_id': `eq.${wsId}`,
    'group.archived': 'eq.false',
    'group.is_course_published': 'eq.true',
    'contact.ws_id': `eq.${wsId}`,
    'contact.archived': 'eq.false',
  });
});

it('reads only the authorized class window and applies the full-precision continuation and update filter', async () => {
  const { db, fetch } = database();
  fetch.mockResolvedValueOnce(Response.json([{ id: classId }]));
  const rows = await listLmsClassSchedule({
    db,
    wsId,
    classId,
    from,
    to,
    limit: 21,
    scope: { kind: 'administrator' },
    after: { startsAt, id: scheduleId },
    updatedSince,
  });
  expect(rows).toEqual([]);
  expect(fetch).toHaveBeenCalledTimes(2);
  const url = new URL(String(fetch.mock.calls[1]?.[0]));
  expect(url.pathname).toBe('/rest/v1/workspace_user_group_sessions');
  expect(
    new Headers(fetch.mock.calls[1]?.[1]?.headers).get('accept-profile')
  ).toBe('private');
  expect(url.searchParams.getAll('starts_at')).toEqual([
    `gte.${from}`,
    `lt.${to}`,
  ]);
  expect(Object.fromEntries(url.searchParams)).toMatchObject({
    select:
      'id,title,starts_at,ends_at,start_timezone,end_timezone,status,updated_at',
    ws_id: `eq.${wsId}`,
    group_id: `eq.${classId}`,
    order: 'starts_at.asc,id.asc',
    limit: '21',
    updated_at: `gte.${updatedSince}`,
    or: `(starts_at.gt.${startsAt},and(starts_at.eq.${startsAt},id.gt.${scheduleId}))`,
  });
});
