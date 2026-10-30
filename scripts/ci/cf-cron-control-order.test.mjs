import assert from 'node:assert/strict';
import { readFileSync, realpathSync } from 'node:fs';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const LIVE_ORDER = [
  '* * * * *',
  '0 */12 * * *',
  '0 */6 * * *',
  '0 6 * * *',
  '*/10 * * * *',
  '*/15 * * * *',
  '17 3 * * *',
  '*/30 * * * *',
  '*/5 * * * *',
];

test('Cron Control passes cf schema and preserves live cron order in emitted config', async () => {
  const app = new URL('../../apps/cron-control/', import.meta.url);
  const cfPackage = pathToFileURL(
    realpathSync(new URL('node_modules/cf/package.json', app))
  );
  const { InputConfigSchema, convertToWranglerConfig } = await import(
    new URL('../@cloudflare/config/dist/index.mjs', cfPackage).href
  );
  const { default: config } = await import(
    new URL('cloudflare.config.ts', app)
  );
  const resolved =
    typeof config === 'function'
      ? await config({ mode: 'production', isPreview: false })
      : config;
  const validated = InputConfigSchema.parse(resolved);
  const emitted = convertToWranglerConfig(validated);
  assert.deepEqual(
    resolved.worker.triggers.map(({ schedule }) => schedule),
    LIVE_ORDER
  );
  assert.deepEqual(emitted.triggers.crons, LIVE_ORDER);
  assert.equal(
    emitted.durable_objects.bindings[0].script_name,
    'tuturuuu-cron-control'
  );
  const { identity } = JSON.parse(
    readFileSync(
      new URL('./fixtures/cf-worker-parity/cron-control.json', import.meta.url),
      'utf8'
    )
  );
  assert.deepEqual(
    [...emitted.triggers.crons].sort(),
    [...identity.crons].sort()
  );
});
