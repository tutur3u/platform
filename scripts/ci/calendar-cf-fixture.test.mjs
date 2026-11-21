import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { calendarFixture } from './calendar-cf-fixture.mjs';

// Root script CI sets NODE_PATH to apps/web/node_modules. Node caches that
// path for the process, so the hoisting check has to start clean or the
// ambient path looks like a root install of cf.
function resolveCfPackage(fromDir) {
  const script = `
    import { createRequire } from 'node:module';
    import { join } from 'node:path';
    try {
      const resolved = createRequire(join(process.env.CF_RESOLVE_FROM, 'package.json')).resolve('cf/package.json');
      process.stdout.write(resolved);
    } catch (error) {
      if (error && error.code === 'MODULE_NOT_FOUND') {
        process.stdout.write('MODULE_NOT_FOUND');
        process.exit(0);
      }
      throw error;
    }
  `;
  const result = spawnSync(
    process.execPath,
    ['--input-type=module', '-e', script],
    {
      env: { ...process.env, NODE_PATH: '', CF_RESOLVE_FROM: fromDir },
      encoding: 'utf8',
    }
  );
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

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
  assert.equal(resolveCfPackage(repo), 'MODULE_NOT_FOUND');
  const fixture = calendarFixture(t, 'probe-', workspace);
  assert.equal(resolveCfPackage(fixture), metadata);
  assert.equal(
    JSON.parse(readFileSync(metadata)).version,
    'workspace-only-fixture'
  );
});
