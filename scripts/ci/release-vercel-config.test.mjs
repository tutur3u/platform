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
      (error) => error.guardCode === 'BUILD_RECIPE_NOT_LEGACY'
    );
});
