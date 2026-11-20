import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const JOB_ID = 'meet-attendance-retention';
const CRON = '17 18 * * *';
const RPC = 'purge_expired_meet_attendance';

test('the Cloudflare retention job calls the purge and stays disabled', () => {
  const jobs = read('apps/cron-control/src/jobs.ts');
  const processor = read(
    'apps/cron-control/src/processors/meet-attendance-retention.ts'
  );
  const config = read('apps/cron-control/cloudflare.config.ts');
  assert.ok(jobs.includes(`'${JOB_ID}'`));
  assert.ok(jobs.includes(`'${CRON}'`));
  assert.ok(jobs.includes(`'/rest/v1/rpc/${RPC}'`));
  assert.ok(processor.includes(`'${RPC}'`));
  assert.ok(processor.includes("'advance_meet_attendance_erasure_intents'"));
  assert.ok(config.includes(`'${CRON}'`));
  const enabled = config.match(
    /CRON_CONTROL_ENABLED_JOBS: bindings\.text\(\s*'([^']*)'/
  );
  assert.equal(enabled?.[1]?.split(',').includes(JOB_ID), false);
  const features = read('packages/realtime/src/meet/class-features.ts');
  assert.ok(
    features.includes(
      `export const MEET_ATTENDANCE_RETENTION_JOB_ID = '${JOB_ID}'`
    )
  );
  assert.ok(
    features.includes(`export const MEET_ATTENDANCE_RETENTION_CRON = '${CRON}'`)
  );
  assert.ok(
    features.includes(`export const MEET_ATTENDANCE_RETENTION_RPC = '${RPC}'`)
  );
  assert.ok(
    features.includes(
      '`${MEET_ATTENDANCE_RETENTION_JOB_ID}:${MEET_ATTENDANCE_RETENTION_CRON}:${MEET_ATTENDANCE_RETENTION_RPC}`'
    )
  );
  const migrations = readdirSync(
    join(root, 'apps/database/supabase/migrations')
  ).filter((name) =>
    name.endsWith('_meet_attendance_cloudflare_retention.sql')
  );
  assert.equal(migrations.length, 1);
  assert.equal(
    /cron\.schedule/.test(
      read(`apps/database/supabase/migrations/${migrations[0]}`)
    ),
    false
  );
});
