const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const test = require('node:test');

test('checks the route count in the Vercel build output', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'vercel-route-budget-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const output = join(directory, 'config.json');
  const script = join(__dirname, 'check-web-vercel-route-budget.js');

  for (const [count, exit] of [
    [1948, 0],
    [1949, 1],
  ]) {
    writeFileSync(
      output,
      JSON.stringify({ routes: Array(count).fill({ src: '/api' }) })
    );
    const result = spawnSync(process.execPath, [script, output], {
      encoding: 'utf8',
    });
    assert.equal(result.status, exit, result.stderr);
    assert.match(
      result.stdout,
      new RegExp(`Web Vercel output routes: ${count}`)
    );
  }

  writeFileSync(output, '{}');
  const missing = spawnSync(process.execPath, [script, output], {
    encoding: 'utf8',
  });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /Missing Vercel output routes/);
});
