import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const app = fileURLToPath(new URL('../', import.meta.url));
const repo = fileURLToPath(new URL('../../../', import.meta.url));
const handler = new URL('./handler.ts', import.meta.url);
const original = readFileSync(handler, 'utf8');
const cases = [
  {
    name: 'gate',
    from: /if \(!origin \|\| !env\.TRUSTED_PROXY_ORIGIN_SECRET\)/u,
    to: 'if (false)',
    test: 'defaults closed',
  },
  {
    name: 'fallback',
    from: /nativeProbe\s*\? await start\(request\)/u,
    to: 'true ? await start(request)',
    test: 'all other paths go to Next',
  },
];
for (const control of cases) {
  assert.ok(
    control.from.test(original),
    `${control.name}: mutation must apply`
  );
  try {
    writeFileSync(handler, original.replace(control.from, control.to));
    const run = spawnSync(
      'bun',
      [
        'x',
        '--no-install',
        'vitest',
        'run',
        '--config',
        `${app}cloudflare/vitest.config.mts`,
        '-t',
        control.test,
      ],
      { cwd: repo, encoding: 'utf8' }
    );
    const output = (run.stdout ?? '') + (run.stderr ?? '');
    assert.notEqual(run.status, 0, `${control.name}: without-fix must fail`);
    assert.match(
      output,
      /AssertionError|expected .* to /u,
      `${control.name}: must fail an assertion, not setup`
    );
    console.log(`${control.name}: expected assertion failure observed`);
  } finally {
    writeFileSync(handler, original);
  }
}
const green = spawnSync('bun', ['run', '--cwd', app, 'test:candidate'], {
  cwd: repo,
  stdio: 'inherit',
});
assert.equal(green.status, 0, 'restored candidate must pass');
