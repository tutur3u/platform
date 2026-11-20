import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import cronControlConfig from '../../apps/cron-control/cloudflare.config.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const JOB_ID = 'meet-attendance-retention';
const CRON = '17 18 * * *';
const RPC = 'purge_expired_meet_attendance';

test('the Cloudflare retention job declares its schedule and calls the purge', () => {
  const jobs = read('apps/cron-control/src/jobs.ts');
  const processor = read(
    'apps/cron-control/src/processors/meet-attendance-retention.ts'
  );
  const registration = [
    ...jobs.matchAll(
      /\bjob\(\s*'([^']+)',\s*'([^']+)',\s*'[^']+',\s*'([^']+)'/gu
    ),
  ].find(([, id]) => id === JOB_ID);
  assert.deepEqual(registration?.slice(1), [
    JOB_ID,
    CRON,
    `/rest/v1/rpc/${RPC}`,
  ]);
  assert.ok(processor.includes(`'${RPC}'`));
  assert.ok(processor.includes("'advance_meet_attendance_erasure_intents'"));
  assert.ok(
    cronControlConfig.worker.triggers.some(
      (trigger) => trigger.type === 'scheduled' && trigger.schedule === CRON
    )
  );
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
      "export const MEET_ATTENDANCE_ERASURE_JOB_ID = 'meet-attendance-erasure'"
    )
  );
  assert.ok(
    features.includes(
      '`${MEET_ATTENDANCE_RETENTION_JOB_ID}:${MEET_ATTENDANCE_RETENTION_CRON}:${MEET_ATTENDANCE_RETENTION_RPC}+${MEET_ATTENDANCE_ERASURE_JOB_ID}`'
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

const flag = 'MEET_CLASS_ATTENDANCE_ENABLED';
const disabled =
  /^\s*(?:export\s+)?["']?MEET_CLASS_ATTENDANCE_ENABLED["']?\s*[:=]\s*(?:'false'|"false"|false)\s*[,;]?\s*(?:(?:\/\/|#).*)?$/u;

function productionConfig(file) {
  if (
    /(?:^|[./_-])(?:staging|preview|development|test|spec|example)(?:[./_-]|$)/iu.test(
      file
    )
  )
    return false;
  return (
    file.startsWith('.github/workflows/') ||
    /(?:\.(?:jsonc?|toml|ya?ml)$|(?:^|\/)\.env(?:\.|$)|(?:^|[./_-])config(?:[./_-]|$))/u.test(
      file
    )
  );
}

const ERASURE_JOB_ID = 'meet-attendance-erasure';

test('the Cloudflare erasure job claims rooms through the realtime entrypoint', () => {
  const jobs = read('apps/cron-control/src/jobs.ts');
  const registration = [
    ...jobs.matchAll(
      /\bjob\(\s*'([^']+)',\s*'([^']+)',\s*'[^']+',\s*'([^']+)',\s*'([^']+)'/gu
    ),
  ].find(([, id]) => id === ERASURE_JOB_ID);
  assert.deepEqual(registration?.slice(1), [
    ERASURE_JOB_ID,
    '*/10 * * * *',
    '/rest/v1/rpc/advance_meet_attendance_erasure_intents',
    'claim-fenced',
  ]);
  const processor = read(
    'apps/cron-control/src/processors/meet-attendance-erasure.ts'
  );
  for (const rpc of [
    'claim_meet_attendance_erasure_rooms',
    'ack_meet_attendance_erasure_room',
  ])
    assert.ok(processor.includes(`'${rpc}'`));
  assert.match(
    read('apps/meet-realtime/src/worker.ts'),
    /export \{ AttendanceErasure \} from '\.\/attendance-erasure-entrypoint';/u
  );
});

function attendanceJobsReady() {
  const enabled = cronControlConfig.worker.env.CRON_CONTROL_ENABLED_JOBS;
  assert.equal(
    enabled?.type,
    'text',
    'expected explicit Cron Control job enablement'
  );
  const jobs = enabled.value.split(',').map((job) => job.trim());
  const binding = cronControlConfig.worker.env.MEET_ATTENDANCE_ERASURE;
  return (
    jobs.includes(JOB_ID) &&
    jobs.includes(ERASURE_JOB_ID) &&
    binding?.type === 'worker' &&
    binding.worker === 'tuturuuu-meet-realtime' &&
    binding.exportName === 'AttendanceErasure'
  );
}

test('production attendance requires enabled Cloudflare retention and erasure jobs', () => {
  if (attendanceJobsReady()) return;
  const matches = execFileSync(
    'git',
    ['grep', '-n', '-I', '-F', flag, '--', 'apps', '.github/workflows'],
    { cwd: root, encoding: 'utf8' }
  );
  const assignments = matches
    .trimEnd()
    .split('\n')
    .flatMap((match) => {
      const [, file, line, source] = /^([^:]+):(\d+):(.*)$/u.exec(match);
      if (
        !productionConfig(file) ||
        /^\s*(?:\/\/|#|\/\*|\*|<!--)/u.test(source)
      )
        return [];
      return [{ location: `${file}:${line}`, source }];
    });
  assert.ok(
    assignments.length > 0,
    'expected production attendance declarations'
  );
  assert.deepEqual(
    assignments
      .filter(({ source }) => !disabled.test(source))
      .map(({ location }) => location),
    [],
    'Keep production attendance disabled until Cron Control enables meet-attendance-retention and meet-attendance-erasure with the AttendanceErasure binding.'
  );
});
