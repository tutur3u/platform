import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  defaultWrite,
  hoursRaceScripts,
  overrideWrite,
} from './tutoring-teacher-hours-concurrency.mjs';

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..'
);
const read = (name) => readFileSync(path.join(root, name), 'utf8');
const migration = read(
  'apps/database/supabase/migrations/20261007060000_tutoring_teacher_hours.sql'
);
const verifier = read(
  'apps/database/scripts/verify-tutoring-teacher-hours-contract.mjs'
);
const workflow = read('.github/workflows/tutoring-teacher-hours-contract.yaml');

test('CI applies complete isolated schema, strict TAP and actual two-connection gates before typegen', () => {
  assert.match(verifier, /deriveIsolatedIdentity\(/u);
  assert.match(verifier, /hasProjectCollision\(/u);
  assert.match(verifier, /trackedFiles/u);
  assert.match(verifier, /readFileSync\(file\)\.equals/u);
  assert.match(verifier, /fixtures = \['tutoring-teacher-hours.sql'\]/u);
  assert.match(verifier, /assertStrictTap\(tap\)/u);
  assert.match(
    verifier,
    /await runTutoringTeacherHoursConcurrency\(metadata\)/u
  );
  assert.match(verifier, /runIsolatedLifecycle/u);
  assert.match(
    verifier,
    /metadata.typegenOutput = 'packages\/types\/src\/supabase.ts'/u
  );
  assert.match(
    workflow,
    /ref: \$\{\{ github.event.pull_request.head.sha \|\| github.sha \}\}/u
  );
  assert.match(workflow, /persist-credentials: false/u);
  assert.match(workflow, /if-no-files-found: error/u);
  assert.match(workflow, /tutoring-teacher-hours-types-/u);
});

test('affected workflow and registry admit migration, fixtures, helpers and pure source changes', () => {
  const pr = workflow.slice(
    workflow.indexOf('  pull_request:'),
    workflow.indexOf('  push:')
  );
  const push = workflow.slice(
    workflow.indexOf('  push:'),
    workflow.indexOf('  workflow_dispatch:')
  );
  for (const block of [pr, push]) {
    for (const required of [
      'apps/database/supabase/migrations/**',
      'apps/database/supabase/tests/tutoring-teacher-hours.sql',
      'apps/database/scripts/run-supabase*.js',
      'apps/database/scripts/tutoring-teacher-hours-concurrency.mjs',
      'apps/database/scripts/time-tracker-control-concurrency.mjs',
      'packages/utils/src/tutoring-teacher-hours.ts',
      'packages/utils/src/__tests__/tutoring-teacher-hours.test.ts',
    ])
      assert.ok(block.includes(required), required);
  }
  assert.match(
    read('tuturuuu.ci.ts'),
    /'tutoring-teacher-hours-contract.yaml': true/u
  );
});

test('absent create/default change/save-reset races contain actual competing writes', () => {
  assert.match(defaultWrite(null), /null,'UTC',true,'\{\}'/u);
  assert.match(defaultWrite('9007199254740993123'), /'9007199254740993123'/u);
  assert.match(overrideWrite('2', '1', true), /'2','1','\{\}',true/u);
  const scripts = hoursRaceScripts(defaultWrite(null), defaultWrite(null));
  assert.match(scripts.holder, /begin;.*statement_timeout='5s'/u);
  assert.match(scripts.holder, /\\echo FIXTURE_READY/u);
  assert.match(scripts.competitor, /application_name='ttr-hours-competitor'/u);
  assert.match(scripts.competitor, /VERBOSITY verbose/u);
});

test('numeric revision conversion is guarded by CASE, not eager AND coercion', () => {
  const functionBody = migration.slice(
    migration.indexOf('create function private.valid_tutoring_hours_revision'),
    migration.indexOf(
      'alter table private.workspace_tutoring_hours_defaults add constraint'
    )
  );
  assert.match(functionBody, /case when p_revision is null then true/u);
  assert.match(functionBody, /when p_revision ~ .*then p_revision::numeric/u);
  assert.match(functionBody, /else false end/u);
});

test('write anchor/default/override order and canonical metadata-only audit are pinned', () => {
  const body = migration.slice(
    migration.indexOf('create function private.save_tutoring_hours_override')
  );
  assert.ok(
    body.indexOf('anchors where ws_id=p_ws for update') <
      body.indexOf('defaults where ws_id=p_ws for update')
  );
  assert.ok(
    body.indexOf('defaults where ws_id=p_ws for update') <
      body.indexOf(
        'overrides where ws_id=p_ws and teacher_id=p_teacher for update'
      )
  );
  assert.match(
    body,
    /base.revision::text is distinct from p_expected_default/u
  );
  assert.match(body, /previous is distinct from p_expected_override/u);
  assert.match(body, /revision=revision\+1/u);
  const audit = migration.slice(
    migration.indexOf('create function private.audit_tutoring_hours_revision'),
    migration.indexOf('create function private.read_tutoring_teacher_hours')
  );
  assert.match(audit, /audit.to_record_id\(rel::oid/u);
  assert.match(audit, /array\['ws_id','teacher_id'\]/u);
  assert.doesNotMatch(audit, /to_jsonb\(current_row\)|'week'|'time_zone'/u);
  assert.match(audit, /p_actor\);/u);
  assert.doesNotMatch(
    migration,
    /delete from private.workspace_tutoring_hours_overrides/iu
  );
});

test('inert storage has exactly three private tables and no direct caller mutations', () => {
  assert.equal((migration.match(/create table private\./gu) ?? []).length, 3);
  assert.match(migration, /from public, anon, authenticated, service_role/u);
  assert.match(migration, /type='MEMBER' for share/u);
  assert.match(migration, /manage_workspace_settings/u);
  assert.match(migration, /view_user_groups/u);
  assert.match(
    migration,
    /u.ws_id=p_ws and m.role='TEACHER' and g.ws_id=p_ws/u
  );
  assert.match(migration, /for share of u,m,g/u);
  assert.doesNotMatch(
    migration,
    /grant .* on .*workspace_tutoring_hours.* to service_role/iu
  );
});

test('read projection uses one expression snapshot and never initializes rows', () => {
  const body = migration.slice(
    migration.indexOf('create function private.read_tutoring_teacher_hours'),
    migration.indexOf('create function private.save_tutoring_hours_default')
  );
  assert.match(body, /return jsonb_build_object\('default',/u);
  assert.doesNotMatch(
    body,
    /into base|into custom|insert into|update private/iu
  );
});
