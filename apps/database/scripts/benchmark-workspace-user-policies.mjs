import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  appendFileSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readLifecycleMetadata } from './run-supabase-isolated.js';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..'
);
const flags = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  assert(
    ['--metadata', '--output', '--runs', '--plans'].includes(process.argv[i])
  );
  assert(process.argv[i + 1]);
  flags.set(process.argv[i], process.argv[i + 1]);
}
assert(flags.has('--metadata') && flags.has('--output'));
const saved = JSON.parse(readFileSync(flags.get('--metadata'), 'utf8'));
const meta = await readLifecycleMetadata(saved.disposableRoot);
assert.equal(path.resolve(meta.repositoryRoot), root);
assert(meta.projectId.startsWith('tt-sec-workspace-us-'));
const ports = JSON.parse(
  execFileSync(
    'docker',
    [
      'inspect',
      '--format',
      '{{json .NetworkSettings.Ports}}',
      `supabase_db_${meta.projectId}`,
    ],
    { encoding: 'utf8' }
  )
);
assert(
  ports['5432/tcp'].some(
    (binding) => Number(binding.HostPort) === meta.basePort + 2
  )
);
const runs = Number(flags.get('--runs') ?? 5);
assert(Number.isInteger(runs) && runs >= 1 && runs <= 7);
const plansEnabled = flags.get('--plans') !== 'no';
const baseline = '17918b61dbd4f7dab982c0833a0b3c701cbf43f6';
const baselineMigration =
  'apps/database/supabase/migrations/20261027150800_workspace_user_access.sql';
const migrationNames = readdirSync(
  path.join(root, 'apps/database/supabase/migrations')
).filter((name) => name.endsWith('_workspace_user_access.sql'));
assert.equal(migrationNames.length, 1);
const migration = `apps/database/supabase/migrations/${migrationNames[0]}`;
const rollback = migration.replace('/migrations/', '/rollback/');
const oldUp = execFileSync(
  'git',
  ['show', `${baseline}:${baselineMigration}`],
  { cwd: root, encoding: 'utf8' }
);
const oldDown = execFileSync(
  'git',
  [
    'show',
    `${baseline}:${baselineMigration.replace('/migrations/', '/rollback/')}`,
  ],
  { cwd: root, encoding: 'utf8' }
);
const newUp = readFileSync(path.join(root, migration), 'utf8');
const newDown = readFileSync(path.join(root, rollback), 'utf8');
const env = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  PGPASSWORD: 'postgres',
};
const args = [
  '-X',
  '-q',
  '-At',
  '-h',
  '127.0.0.1',
  '-p',
  String(meta.basePort + 2),
  '-U',
  'postgres',
  '-d',
  'postgres',
  '-v',
  'ON_ERROR_STOP=1',
];
const output = flags.get('--output');
const report = '/private/tmp/tuturuuu-ops-20261023/sec-new1-report.md';
function psql(sql, maxMs = 45000) {
  return spawnSync('psql', args, {
    input: sql,
    encoding: 'utf8',
    env,
    timeout: maxMs,
    maxBuffer: 16 * 1024 * 1024,
  });
}
function checked(sql) {
  const result = psql(sql, 180000);
  if (result.status !== 0) {
    appendFileSync(report, `\nBenchmark SQL failure\n${result.stderr}`);
    throw new Error('Isolated benchmark SQL failed; see private report');
  }
  return result.stdout.trim();
}
function currentVariant() {
  const state = checked(
    "select case when to_regprocedure('private.workspace_user_permission_workspaces(text[])') is not null then 'after' when to_regprocedure('private.workspace_user_attendance_access(uuid,uuid)') is not null then 'before' else 'base' end;"
  );
  assert(['after', 'before', 'base'].includes(state));
  return state;
}
function switchTo(target) {
  const current = currentVariant();
  if (current === target) return;
  const down =
    current === 'after' ? newDown : current === 'before' ? oldDown : '';
  const up = target === 'after' ? newUp : oldUp;
  checked(`begin;\n${down}\n${up}\ncommit;`);
  assert.equal(currentVariant(), target);
  assert.equal(
    checked(
      "select count(*) from pg_policy where polname='account_required_mfa' and polrelid in ('public.workspace_users'::regclass,'public.user_group_attendance'::regclass,'public.user_indicators'::regclass);"
    ),
    '3'
  );
}
const id = (suffix) => `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;
const actor = id('991001'),
  owner = id('991002'),
  ws = id('991010'),
  group = id('991020'),
  role = id('991030');
const marker = 'workspace-user-policy-benchmark-v1';
const exists = checked(
  `select count(*) from public.workspaces where id='${ws}';`
);
if (exists === '0') {
  checked(`begin;
set local session_replication_role=replica;
insert into auth.users(id,aud,role,email,raw_app_meta_data,created_at,updated_at) values
('${actor}','authenticated','authenticated','policy-bench-member@example.invalid','{}',now(),now()),
('${owner}','authenticated','authenticated','policy-bench-owner@example.invalid','{}',now(),now());
insert into public.users(id) values ('${actor}'),('${owner}');
insert into public.workspaces(id,name,personal,creator_id) values ('${ws}','${marker}',false,'${owner}');
insert into public.workspace_members(ws_id,user_id,type) values ('${ws}','${actor}','MEMBER');
insert into public.workspace_roles(id,ws_id,name) values ('${role}','${ws}','Statement benchmark member');
insert into public.workspace_role_members(role_id,user_id) values ('${role}','${actor}');
insert into public.workspace_role_permissions(role_id,ws_id,permission,enabled) values
('${role}','${ws}','view_users_public_info',true),('${role}','${ws}','check_user_attendance',true);
insert into public.workspace_user_groups(id,ws_id,name) values ('${group}','${ws}','Benchmark class');
insert into public.workspace_users(id,ws_id,display_name)
select md5('workspace-user-policy-bench-'||n)::uuid,'${ws}','Synthetic benchmark '||n from generate_series(1,100000)n;
insert into public.user_group_attendance(id,user_id,group_id,date,status)
select md5('workspace-user-attendance-bench-'||n||'-'||d)::uuid,md5('workspace-user-policy-bench-'||n)::uuid,'${group}','2026-01-01'::date+d,'PRESENT'
from generate_series(1,100000)n cross join generate_series(0,2)d;
commit;
analyze public.workspace_users;
analyze public.user_group_attendance;
analyze public.workspace_members;
analyze public.workspace_role_members;
analyze public.workspace_role_permissions;`);
} else {
  assert.equal(
    checked(`select name from public.workspaces where id='${ws}';`),
    marker
  );
}
const queries = {
  workspace_users_100k: `select count(*) from public.workspace_users where ws_id='${ws}';`,
  attendance_300k: `select count(*) from public.user_group_attendance where group_id='${group}';`,
};
const expected = { workspace_users_100k: 100000, attendance_300k: 300000 };
for (const [key, sql] of Object.entries(queries))
  assert.equal(Number(checked(sql)), expected[key]);
assert.equal(
  checked(
    `select count(*) from public.user_group_attendance a join public.workspace_users u on u.id=a.user_id join public.workspace_user_groups g on g.id=a.group_id and g.ws_id=u.ws_id where a.group_id='${group}';`
  ),
  '300000'
);
const claims = JSON.stringify({
  sub: actor,
  role: 'authenticated',
  aal: 'aal2',
});
function asMember(sql, limit = '8s', track = false) {
  return `begin;\nset local role authenticated;\nset local request.jwt.claims='${claims}';\nset local statement_timeout='${limit}';\n${track ? "set local track_functions='all';\n" : ''}${sql}\nrollback;\n`;
}
const result = {
  baseline,
  candidateSqlSha256: createHash('sha256').update(newUp).digest('hex'),
  projectId: meta.projectId,
  actor: 'authenticated MEMBER, non-creator, explicit read/attendance role',
  fixtures: expected,
  runs,
  statementLimitMs: 8000,
  diagnosticPlanLimitMs: 30000,
  hostLoad: execFileSync('uptime', { encoding: 'utf8' }).trim(),
  cpus: Number(
    execFileSync('/usr/sbin/sysctl', ['-n', 'hw.ncpu'], {
      encoding: 'utf8',
    }).trim()
  ),
  settings: JSON.parse(
    checked(
      "select json_build_object('postgres',current_setting('server_version'),'work_mem',current_setting('work_mem'),'jit',current_setting('jit'),'max_parallel_workers_per_gather',current_setting('max_parallel_workers_per_gather'));"
    )
  ),
  samples: [],
  plans: {},
  errors: [],
};
const save = () =>
  writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
try {
  for (let i = 0; i < runs; i++) {
    for (const variant of i % 2 === 0
      ? ['before', 'after']
      : ['after', 'before']) {
      switchTo(variant);
      for (const [key, sql] of Object.entries(queries)) {
        const measured = psql(
          asMember(`\\timing on\n${sql}\n\\timing off`),
          12000
        );
        const times = [...measured.stdout.matchAll(/Time: ([0-9.]+) ms/g)].map(
          (match) => Number(match[1])
        );
        const counts = measured.stdout
          .split(/\r?\n/)
          .filter((line) => /^\d+$/.test(line))
          .map(Number);
        if (measured.status === 0) {
          assert.equal(times.length, 1);
          assert.deepEqual(counts, [expected[key]]);
          result.samples.push({
            iteration: i + 1,
            variant,
            query: key,
            milliseconds: times[0],
            count: counts[0],
            outcome: 'ok',
          });
        } else if (measured.stderr.includes('statement timeout')) {
          result.samples.push({
            iteration: i + 1,
            variant,
            query: key,
            milliseconds: null,
            count: null,
            outcome: 'timeout_8s',
          });
          result.errors.push({
            iteration: i + 1,
            variant,
            query: key,
            kind: 'timeout_8s',
          });
        } else {
          appendFileSync(
            report,
            `\nUnexpected benchmark error\n${measured.stderr}`
          );
          throw new Error('Benchmark process or SQL error');
        }
        save();
        console.log(
          `${variant} ${key}: ${JSON.stringify(result.samples.at(-1))}`
        );
      }
    }
  }
  if (plansEnabled) {
    for (const variant of ['before', 'after']) {
      switchTo(variant);
      result.plans[variant] = {};
      for (const [key, sql] of Object.entries(queries)) {
        const plan = psql(
          asMember(`explain (analyze, buffers, settings) ${sql}`, '30s'),
          35000
        );
        assert.equal(plan.status, 0, 'Bounded diagnostic EXPLAIN failed');
        result.plans[variant][key] = plan.stdout.trim();
        save();
      }
    }
  }
  switchTo('after');
  const profile = psql(
    `set track_functions='all';\n${asMember(queries.attendance_300k, '8s')}`
  );
  assert.equal(
    profile.status,
    0,
    'After profile must complete within 8 seconds'
  );
  result.functionProfile = JSON.parse(
    checked(
      "select coalesce(json_agg(json_build_object('function',schemaname||'.'||funcname,'calls',calls,'total_ms',total_time,'self_ms',self_time)), '[]') from pg_stat_user_functions where funcname in ('workspace_user_permission_workspaces','workspace_user_attendance_scope','has_workspace_permission');"
    )
  );
  assert.equal(
    result.functionProfile.find(
      (row) => row.function === 'private.workspace_user_permission_workspaces'
    )?.calls,
    1,
    'Permission workspace set must be computed once per statement'
  );
  for (const key of Object.keys(queries)) {
    const samples = result.samples.filter(
      (s) => s.variant === 'after' && s.query === key
    );
    assert(
      samples.every((s) => s.outcome === 'ok' && s.count === expected[key]),
      'After acceptance requires every sample to succeed with full work'
    );
  }
  result.acceptance =
    'all after samples complete correct row counts within the unchanged 8s limit';
  save();
} finally {
  if (currentVariant() !== 'after') switchTo('after');
}
console.log(`Benchmark complete: ${output}`);
