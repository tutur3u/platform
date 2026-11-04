import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { assertMeetRealtimePolicy } from './verify-meet-realtime-policy.mjs';

const config = JSON.parse(
  readFileSync(
    new URL('../../apps/meet-realtime/wrangler.jsonc', import.meta.url),
    'utf8'
  )
);
test('admits the contained realtime deployment', () =>
  assertMeetRealtimePolicy(config));
for (const vars of [
  {},
  { MEET_AI_DISABLED: 'false', MEET_AI_ENABLED_WORKSPACE_IDS: '' },
  { MEET_AI_DISABLED: 'true', MEET_AI_ENABLED_WORKSPACE_IDS: 'workspace' },
]) {
  test(`rejects AI pin drift ${JSON.stringify(vars)}`, () =>
    assert.throws(() => assertMeetRealtimePolicy({ ...config, vars })));
}
for (const key of ['workers_dev', 'preview_urls']) {
  test(`rejects public alternate ingress ${key}`, () =>
    assert.throws(() => assertMeetRealtimePolicy({ ...config, [key]: true })));
}
test('rejects route drift', () =>
  assert.throws(() => assertMeetRealtimePolicy({ ...config, routes: [] })));
