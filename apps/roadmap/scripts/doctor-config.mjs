import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { supportedCompatibilityDate } from 'miniflare';

/** Void emits one JSON deployment config beside the Worker entry. */
export async function readBuiltWorkerConfig(serverRoot) {
  const configs = (await readdir(serverRoot)).filter((file) =>
    file.endsWith('.json')
  );
  assert.equal(configs.length, 1, 'Require one emitted JSON Worker config');
  const config = JSON.parse(
    await readFile(join(serverRoot, configs[0]), 'utf8')
  );
  assert.equal(config.name, 'tuturuuu-roadmap', 'Unexpected emitted Worker');
  assert.equal(config.main, 'index.js', 'Unexpected emitted Worker entry');
  return config;
}

/** The emitted config must not expose an origin outside the zone WAF. */
export function assertWorkerOrigins(config) {
  assert.equal(config.workers_dev, false, 'workers_dev must be false');
  assert.equal(config.preview_urls, false, 'preview_urls must be false');
  assert.deepEqual(
    config.routes,
    [
      { pattern: 'tuturuuu.com/roadmap', zone_name: 'tuturuuu.com' },
      { pattern: 'tuturuuu.com/roadmap/*', zone_name: 'tuturuuu.com' },
    ],
    'routes must be only the two canonical roadmap patterns'
  );
}

/**
 * The worker's compatibility date, capped at what this workerd supports.
 * HTMLRewriter (the CSP's script collection) is not date-gated.
 */
export function doctorCompatibilityDate(
  configured,
  supported = supportedCompatibilityDate
) {
  return configured && configured <= supported ? configured : supported;
}
