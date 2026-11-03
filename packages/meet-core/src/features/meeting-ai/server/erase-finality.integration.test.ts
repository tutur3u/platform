import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Explicit fixture-only opt-in. No URL, credentials, production or staging access.
const container = process.env.MEET_ERASE_TEST_CONTAINER;
const database = 'erase_v10_fixture';
const ws = '00000000-0000-4000-8000-000000000001';
const meeting = '00000000-0000-4000-8000-000000000002';
const key = '00000000-0000-4000-8000-000000000030';
const args = [
  'exec',
  '-i',
  container ?? '',
  'psql',
  '-X',
  '-qAt',
  '-U',
  'supabase_admin',
  '-d',
  database,
  '-v',
  'ON_ERROR_STOP=1',
];
function query(sql: string) {
  const result = spawnSync('docker', args, { input: sql, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
}
async function hold(sql: string) {
  const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
  const done = new Promise<void>((resolve, reject) => {
    child.once('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`psql exit ${code}`))
    );
    child.once('error', reject);
  });
  const ready = new Promise<void>((resolve, reject) => {
    let output = '';
    child.stdout.on('data', (data: Buffer) => {
      output += data.toString();
      if (output.includes('LOCK_READY')) resolve();
    });
    child.stderr.once('data', (data: Buffer) =>
      reject(new Error(data.toString()))
    );
    child.once('exit', () => reject(new Error('psql exited before lock')));
  });
  child.stdin.write(`begin;\n${sql}\n\\echo LOCK_READY\n`);
  await ready;
  return async () => {
    child.stdin.end('commit;\n');
    await done;
  };
}

describe.skipIf(!container)(
  'V10 PostgreSQL 17 concurrency (disposable fixture only)',
  () => {
    beforeAll(() => {
      const source = readFileSync(
        new URL(
          '../../../../../../apps/database/supabase/tests/meet-transcript-erase.sql',
          import.meta.url
        ),
        'utf8'
      );
      const start = source.indexOf('insert into public.users');
      const end = source.indexOf(
        'select is(private.count_meet_subject_segments'
      );
      query(
        `create schema test_v10;\n${source.slice(start, end).replaceAll('pg_temp.execute_fixture', 'test_v10.execute_fixture')}`
      );
    });
    afterAll(() => {
      query('drop schema if exists test_v10 cascade;');
    });

    it('shared batches coexist in a workspace (no lock upgrade)', async () => {
      const release = await hold(
        `select private.lock_meet_hold_barrier('${ws}',false);`
      );
      try {
        expect(
          query(
            `begin; set local lock_timeout='200ms'; select (private.lock_meet_hold_barrier('${ws}',false)).ws_id; commit;`
          )
        ).toContain(ws);
        expect(() =>
          query(
            `begin; set local lock_timeout='200ms'; select private.lock_meet_hold_barrier('${ws}',true); commit;`
          )
        ).toThrow(/lock timeout/);
      } finally {
        await release();
      }
    }, 10000);

    it('exclusive hold create/release excludes destructive admissions', async () => {
      const release = await hold(
        `select private.lock_meet_hold_barrier('${ws}',true);`
      );
      try {
        expect(() =>
          query(`select private.lock_meet_hold_barrier('${ws}',false);`)
        ).toThrow(/lock timeout/);
      } finally {
        await release();
      }
    }, 10000);

    it('paused P1 before COMMIT stays unknown, then returns its committed receipt', async () => {
      const release = await hold(`select test_v10.execute_fixture('${key}');
      update private.meet_erasure_issuances set issued_at=clock_timestamp()-interval '2 hours',expires_at=clock_timestamp()-interval '1 second' where operation_key='${key}';`);
      try {
        expect(
          query(
            `select private.decide_meet_erasure_finality('${ws}','${meeting}','${key}')->>'state';`
          )
        ).toBe('unknown');
      } finally {
        await release();
      }
      expect(
        query(
          `select private.decide_meet_erasure_finality('${ws}','${meeting}','${key}')->>'state';`
        )
      ).toBe('in_progress');
    }, 10000);

    it('cancelled issuance cannot later commit, and timeout never cancels it', () => {
      const unused = '00000000-0000-4000-8000-000000000031';
      const result =
        query(`insert into private.meet_erasure_issuances(operation_key,ws_id,meeting_id,actor_user_id,actor_kind,issued_at,expires_at)
      values('${unused}','${ws}','${meeting}','00000000-0000-4000-8000-000000000010','subject',clock_timestamp()-interval '2 hours',clock_timestamp()-interval '1 hour');
      select private.decide_meet_erasure_finality('${ws}','${meeting}','${unused}')->>'state';
      create function pg_temp.attempt_cancelled() returns text language plpgsql as $$
      begin perform test_v10.execute_fixture('${unused}'); return 'unexpected commit';
      exception when others then return sqlerrm; end $$;
      select pg_temp.attempt_cancelled();
      select count(*) from private.meet_transcript_erasures where operation_key='${unused}';`);
      expect(result.split('\n')).toEqual([
        'cancelled',
        'MEET_ERASE_EXPIRED',
        '0',
      ]);
    });
  }
);
