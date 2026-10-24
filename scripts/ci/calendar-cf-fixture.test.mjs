import assert from 'node:assert/strict';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { calendarFixture } from './calendar-cf-fixture.mjs';

test('Calendar fixtures resolve a workspace-only cf install without root hoisting', (t) => {
  const repo = realpathSync(
    mkdtempSync(join(tmpdir(), 'calendar-isolated-layout-'))
  );
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const workspace = join(repo, 'apps/calendar');
  const cf = join(workspace, 'node_modules/cf');
  mkdirSync(cf, { recursive: true });
  const metadata = join(cf, 'package.json');
  writeFileSync(
    metadata,
    JSON.stringify({
      name: 'cf',
      version: 'workspace-only-fixture',
      exports: { './package.json': './package.json' },
    })
  );
  assert.throws(
    () => createRequire(join(repo, 'package.json')).resolve('cf/package.json'),
    { code: 'MODULE_NOT_FOUND' }
  );
  const fixture = calendarFixture(t, 'probe-', workspace);
  const resolved = createRequire(join(fixture, 'package.json')).resolve(
    'cf/package.json'
  );
  assert.equal(resolved, metadata);
  assert.equal(
    JSON.parse(readFileSync(resolved)).version,
    'workspace-only-fixture'
  );
});
