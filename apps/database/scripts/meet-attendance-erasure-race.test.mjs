// Two-transaction races on a real Postgres with the attendance migrations
// applied. Set MEET_ATTENDANCE_PG_URL to a disposable local Supabase database
// (for example an isolated `supabase start`); the test is skipped otherwise.
// It needs psql on PATH and writes only rows under its own fixed keys.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import test from 'node:test';

const url = process.env.MEET_ATTENDANCE_PG_URL;
const skip = url ? false : 'MEET_ATTENDANCE_PG_URL is not set';

function psql(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'psql',
      [url, '-v', 'ON_ERROR_STOP=1', '-q', '-tA', '-c', sql],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk) => (out += chunk));
    child.stderr.on('data', (chunk) => (err += chunk));
    child.on('close', (code) =>
      code === 0 ? resolve(out.trim()) : reject(new Error(err))
    );
  });
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const ws = '11111111-1111-4111-8111-1111111111e1';
const meeting = '33333333-3333-4333-8333-3333333333e1';

function plan(key, phase, extra = {}) {
  return JSON.stringify({
    phase,
    attempt: phase,
    sql: { op: 'meeting', meetingId: key },
    rooms: [],
    ...extra,
  });
}

async function phaseOf(kind, key) {
  return psql(
    `select plan->>'phase' from private.meet_attendance_pending_erasures where kind = '${kind}' and subject_key = '${key}'`
  );
}

async function clear(kind, key) {
  await psql(
    `delete from private.meet_attendance_pending_erasures where kind = '${kind}' and subject_key = '${key}'`
  );
}

for (const [first, second] of [
  ['confirmed', 'planned'],
  ['planned', 'confirmed'],
]) {
  test(
    `first writers for a new key serialize: ${first} then ${second}`,
    { skip },
    async () => {
      const key = first === 'confirmed' ? meeting : `${meeting.slice(0, -1)}2`;
      await clear('meeting', key);
      const holder = psql(`
      begin;
      set local role service_role;
      select private.store_meet_attendance_intent('meeting', '${key}', '${plan(key, first)}'::jsonb);
      select pg_sleep(1.5);
      commit;
    `);
      await delay(400);
      const started = Date.now();
      await psql(`
      begin;
      set local role service_role;
      select private.store_meet_attendance_intent('meeting', '${key}', '${plan(key, second)}'::jsonb);
      commit;
    `);
      const waited = Date.now() - started;
      await holder;
      assert.ok(waited >= 700, `second writer waited ${waited}ms`);
      assert.equal(await phaseOf('meeting', key), 'confirmed');
      await clear('meeting', key);
    }
  );
}

test(
  'a refusal cancel racing the schedule confirmation keeps the intent',
  { skip },
  async () => {
    const user = '44444444-4444-4444-8444-4444444444e1';
    const key = `user:${user}`;
    await clear('subject', key);
    const subject = JSON.stringify({
      phase: 'planned',
      attempt: 'attempt-1',
      sql: { op: 'subject', userId: user },
      rooms: [{ roomId: `${ws}:${meeting}`, wsId: ws, meetingId: meeting }],
    });
    const fence = await psql(
      'select stopped from private.meet_attendance_retention_control'
    );
    await psql(`
    update private.meet_attendance_retention_control set stopped = false;
    select private.store_meet_attendance_intent('subject', '${key}', '${subject}'::jsonb);
  `);
    try {
      const confirming = psql(`
      begin;
      set local role service_role;
      select private.advance_meet_attendance_erasure_intents(32);
      select pg_sleep(1.5);
      commit;
    `);
      await delay(400);
      const cancelled = await psql(`
      begin;
      set local role service_role;
      select private.cancel_meet_attendance_intent('subject', '${key}', 'attempt-1');
      commit;
    `);
      await confirming;
      assert.equal(cancelled, 'kept');
      assert.equal(await phaseOf('subject', key), 'confirmed');
    } finally {
      await clear('subject', key);
      await psql(
        `update private.meet_attendance_retention_control set stopped = ${fence === 't'}`
      );
    }
  }
);
