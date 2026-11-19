import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const sql = readFileSync(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../../../../../../apps/database/supabase/migrations/20261119170000_meet_class_attendance.sql'
  ),
  'utf8'
);

it('keeps attendance in the private schema and lets the service role write it', () => {
  expect(sql).toMatch(/create table private\.meet_attendance_sessions/i);
  expect(sql).not.toMatch(/create table public\.meet_attendance_sessions/i);
  expect(sql).toMatch(/enable row level security/i);
  expect(sql).toMatch(/for select/i);
  expect(sql).toMatch(/creator_id = \(select auth\.uid\(\)\)/);
  expect(sql).not.toMatch(/grant [^;]*to anon/i);
  expect(sql).not.toMatch(/grant [^;]*to public/i);
  expect(sql).not.toMatch(/grant [^;]*to authenticated/i);
  expect(sql).toMatch(
    /grant select, insert, update, delete on table private\.meet_attendance_sessions to service_role/i
  );
  expect(sql).toMatch(/participant_kind in \('member', 'guest'\)/);
  expect(sql).not.toMatch(/security definer/i);
});
