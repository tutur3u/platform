import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { validateOutput, verify } from './calendar-native-artifact.mjs';

// Admission uses the owning sealed producer contract, never a normalized copy.
export async function inspectCalendarProfile(options, config) {
  const app = dirname(options.ownerPackage);
  const receipt = JSON.parse(
    await readFile(resolve(app, 'calendar-artifact.json'), 'utf8')
  );
  verify(app, receipt, options.sourceSHA);
  const output = validateOutput(app, options.sourceSHA);
  assert.equal(options.root, resolve(app, 'dist'));
  assert.equal(options.config, output.configPath);
  assert.equal(options.main, output.main);
  assert.deepEqual(config, output.config, 'Calendar emitted config changed');
}

export function denyCalendarOutbound(unexpected) {
  return async (request) => {
    unexpected.push(new URL(request.url).origin);
    return new Response('Fixture forbids network', { status: 599 });
  };
}
