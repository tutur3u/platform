import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as publisher from './calendar-exact-sha-publisher.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CALENDAR_VERCEL,
  validateVercelSection,
} from './release-vercel-config.mjs';
import {
  CALENDAR_PRODUCTION_ALIAS,
  CALENDAR_SUPABASE_HOST,
  CALENDAR_LEGACY_BUILD_COMMAND,
  GUARD_CODES,
} from './calendar-exact-sha-publisher.mjs';

test('Calendar stage consumes the validated record without changing guard vocabulary', () => {
  assert.equal(CALENDAR_PRODUCTION_ALIAS, CALENDAR_VERCEL.productionAlias);
  assert.equal(CALENDAR_SUPABASE_HOST, CALENDAR_VERCEL.supabaseHost);
  assert.equal(CALENDAR_LEGACY_BUILD_COMMAND, CALENDAR_VERCEL.buildCommand);
  assert.equal(GUARD_CODES.length, 37);
  assert.ok(Object.isFrozen(CALENDAR_VERCEL));
});

test('closed Vercel extension rejects unsafe identities and environment widening', () => {
  for (const patch of [
    { extra: true },
    { productionAlias: '*.tuturuuu.com' },
    { productionAlias: 'https://calendar.tuturuuu.com' },
    { appDirectory: '../calendar' },
    { stageEnvironment: 'vercel-production-calendar' },
    { sourceShaEnv: 'secret=value' },
    { cliVersion: 'latest' },
    { supabaseHost: 'host/path' },
    { buildCommand: 'build\nother' },
  ])
    assert.throws(
      () => validateVercelSection({ ...CALENDAR_VERCEL, ...patch }),
      (error) => error.guardCode === 'VERCEL_CONFIG_INVALID'
    );
});

test('Calendar record pins every admitted literal', () => {
  assert.deepEqual(CALENDAR_VERCEL, {
    appDirectory: 'apps/calendar',
    productionAlias: 'calendar.tuturuuu.com',
    supabaseHost: 'nzamlzqfdwaaxdefwraj.supabase.co',
    buildCommand:
      "cd ../.. && bun turbo:local run build --filter='@tuturuuu/calendar^...' && bun run --cwd apps/calendar build:legacy",
    projectSecretName: 'VERCEL_CALENDAR_PROJECT_ID',
    stageEnvironment: 'vercel-stage-calendar',
    sourceShaEnv: 'CALENDAR_MAIN_SHA',
    aliasPreimageEnv: 'CALENDAR_ALIAS_PREIMAGE',
    cliVersion: '59.25.0',
  });
});

test('publisher exports match landed 1643dd1142 values and function sources', () => {
  const signature = Object.fromEntries(
    Object.entries(publisher).map(([key, value]) => [
      key,
      typeof value === 'function' ? String(value) : value,
    ])
  );
  assert.equal(
    createHash('sha256').update(JSON.stringify(signature)).digest('hex'),
    '549f1976182193b8414d96a3249f7b2050442d7c2b55b5b7d09f0a1e5bc046bb'
  );
});

test('record pins the workflow environment, project secret, CLI and input mapping', () => {
  const workflow = readFileSync(
    new URL(
      '../../.github/workflows/calendar-vercel-exact-sha.yaml',
      import.meta.url
    ),
    'utf8'
  );
  assert.ok(
    workflow.includes(`environment: ${CALENDAR_VERCEL.stageEnvironment}\n`)
  );
  assert.ok(
    workflow.includes(`secrets.${CALENDAR_VERCEL.projectSecretName} }}`)
  );
  assert.ok(
    workflow.includes(`vercel@${CALENDAR_VERCEL.cliVersion} --ignore-scripts`)
  );
  assert.ok(
    workflow.includes(CALENDAR_VERCEL.sourceShaEnv + ': ${{ inputs.main_sha }}')
  );
  assert.ok(
    workflow.includes(
      CALENDAR_VERCEL.aliasPreimageEnv + ': ${{ inputs.alias_preimage }}'
    )
  );
});

test('input names are distinct, app-prefixed and cannot name credentials', () => {
  for (const patch of [
    { sourceShaEnv: 'VERCEL_TOKEN' },
    { sourceShaEnv: 'CALENDAR_TOKEN' },
    { sourceShaEnv: 'CALENDAR_SECRET' },
    { sourceShaEnv: 'CALENDAR_KEY' },
    { sourceShaEnv: 'MAIL_MAIN_SHA' },
    { sourceShaEnv: 'VERCEL_ORG_ID' },
    { sourceShaEnv: 'CALENDAR_ALIAS_PREIMAGE' },
    { projectSecretName: 'VERCEL_TOKEN' },
  ])
    assert.throws(
      () => validateVercelSection({ ...CALENDAR_VERCEL, ...patch }),
      { guardCode: 'VERCEL_CONFIG_INVALID', phase: 'config-import' }
    );
});
