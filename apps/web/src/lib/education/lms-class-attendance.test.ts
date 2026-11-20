import { createClient } from '@supabase/supabase-js';
import type { Database } from '@tuturuuu/types/supabase';
import { expect, it, vi } from 'vitest';
import { listLmsClassAttendance } from './lms-class-attendance';

const wsId = 'c7100000-0000-4000-8000-000000000001';
const classId = 'c7100000-0000-4000-8000-000000000002';
const contactId = 'c7100000-0000-4000-8000-000000000003';
const markId = 'c7100000-0000-4000-8000-000000000004';

it.each(['student', 'teacher', 'administrator'] as const)(
  'applies the %s attendance scope within the bounded class query',
  async (kind) => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json([{ id: classId, marks: [] }])
    );
    const db = createClient<Database>(
      'https://database.example.test',
      'test-key',
      {
        auth: { persistSession: false },
        global: { fetch },
      }
    );
    const rows = await listLmsClassAttendance({
      db,
      wsId,
      classId,
      from: '2026-11-01',
      to: '2026-12-01',
      scope: kind === 'administrator' ? { kind } : { kind, contactId },
      after: { date: '2026-11-10', id: markId },
      limit: 21,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    const { searchParams } = new URL(String(fetch.mock.calls[0]?.[0]));
    expect(Object.fromEntries(searchParams)).toMatchObject({
      ws_id: `eq.${wsId}`,
      id: `eq.${classId}`,
      archived: 'eq.false',
      is_guest: 'eq.false',
      'marks.contact.ws_id': `eq.${wsId}`,
      'marks.order': 'date.asc,id.asc',
      'marks.limit': '21',
      'marks.or': `(date.gt.2026-11-10,and(date.eq.2026-11-10,id.gt.${markId}))`,
    });
    expect(searchParams.getAll('marks.date')).toEqual([
      'gte.2026-11-01',
      'lt.2026-12-01',
    ]);
    expect(searchParams.get('select')).not.toContain('notes');
    expect(searchParams.get('enrollment.user_id')).toBe(
      kind === 'administrator' ? null : `eq.${contactId}`
    );
    expect(searchParams.get('enrollment.role')).toBe(
      kind === 'administrator' ? null : `eq.${kind.toUpperCase()}`
    );
    expect(searchParams.get('enrollment.contact.archived')).toBe(
      kind === 'administrator' ? null : 'eq.false'
    );
    expect(searchParams.get('marks.user_id')).toBe(
      kind === 'student' ? `eq.${contactId}` : null
    );
    expect(searchParams.get('is_course_published')).toBe(
      kind === 'student' ? 'eq.true' : null
    );
    expect(rows).toEqual([]);
  }
);
