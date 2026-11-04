import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function assertMeetRealtimePolicy(config) {
  assert.equal(
    config.vars?.MEET_AI_DISABLED,
    'true',
    'Meet AI must stay disabled'
  );
  assert.equal(
    config.vars?.MEET_AI_ENABLED_WORKSPACE_IDS,
    '',
    'Meet AI allowlist must stay empty'
  );
  assert.equal(config.workers_dev, false, 'workers.dev must stay disabled');
  assert.equal(config.preview_urls, false, 'preview URLs must stay disabled');
  assert.deepEqual(config.routes, [
    { pattern: 'meet-realtime.tuturuuu.com', custom_domain: true },
  ]);
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  assertMeetRealtimePolicy(
    JSON.parse(
      readFileSync(
        new URL('../../apps/meet-realtime/wrangler.jsonc', import.meta.url),
        'utf8'
      )
    )
  );
}
