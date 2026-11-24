import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vite-plus/test';
import { checkBuildOutput, FORBIDDEN_MARKERS } from './check-build-output.mjs';

const SCRIPT = fileURLToPath(
  new URL('./check-build-output.mjs', import.meta.url)
);
const dirs = [];

function app(files) {
  const dir = mkdtempSync(join(tmpdir(), 'sso-signer-build-'));
  dirs.push(dir);
  for (const [path, text] of Object.entries(files)) {
    const full = join(dir, path);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, text);
  }
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

describe('signer build output check', () => {
  it('accepts emitted scripts without the unchecked path', () => {
    const dir = app({
      '.cloudflare/output/v0/worker/index.js': 'export default {};',
      '.cloudflare/output/v0/config.json': '{"name":"tuturuuu-sso-signer"}',
    });
    expect(checkBuildOutput(dir)).toMatchObject({ ok: true });
  });

  it.each(FORBIDDEN_MARKERS)(
    'refuses an artifact that contains %s',
    (marker) => {
      for (const path of [
        '.cloudflare/output/v0/worker/chunk.js',
        '.cloudflare/output/v0/worker/nested/deep/chunk.mjs',
        'dist/worker/index.js',
      ]) {
        const dir = app({
          '.cloudflare/output/v0/worker/index.js': 'export default {};',
          [path]: `const mode = "${marker}";`,
        });
        const result = checkBuildOutput(dir);
        expect(result.ok, path).toBe(false);
        expect(result.message).toContain(marker);
      }
    }
  );

  it('refuses when nothing was emitted', () => {
    expect(checkBuildOutput(app({}))).toMatchObject({ ok: false });
    expect(
      checkBuildOutput(app({ '.cloudflare/output/v0/config.json': '{}' }))
    ).toMatchObject({ ok: false });
  });

  it('refuses a dist-only build: .cloudflare/output is what gets deployed', () => {
    const distOnly = app({ 'dist/worker/index.js': 'export default {};' });
    const result = checkBuildOutput(distOnly);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('.cloudflare/output');
    expect(spawnSync(process.execPath, [SCRIPT, distOnly]).status).toBe(1);
    expect(
      checkBuildOutput(
        app({
          'dist/worker/index.js': 'export default {};',
          '.cloudflare/output/v0/config.json': '{}',
        })
      )
    ).toMatchObject({ ok: false });
  });

  it('does not count a source map as an emitted Worker script', () => {
    const mapOnly = app({
      '.cloudflare/output/v0/worker/index.js.map': '{"version":3}',
      'dist/worker/index.js': 'export default {};',
    });
    const result = checkBuildOutput(mapOnly);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('.cloudflare/output');
    expect(spawnSync(process.execPath, [SCRIPT, mapOnly]).status).toBe(1);
  });

  it.each(FORBIDDEN_MARKERS)('still scans source maps for %s', (marker) => {
    const dir = app({
      '.cloudflare/output/v0/worker/index.js': 'export default {};',
      '.cloudflare/output/v0/worker/index.js.map': `{"sources":["${marker}"]}`,
    });
    const result = checkBuildOutput(dir);
    expect(result.ok).toBe(false);
    expect(result.message).toContain(`index.js.map contains ${marker}`);
  });

  it('counts the deployed scripts in its success message', () => {
    const dir = app({
      '.cloudflare/output/v0/worker/index.js': 'export default {};',
      '.cloudflare/output/v0/worker/chunk.mjs': 'export {};',
      'dist/worker/index.js': 'export default {};',
    });
    expect(checkBuildOutput(dir)).toEqual({
      ok: true,
      message: '3 script(s) checked, 2 under .cloudflare/output',
    });
    const run = spawnSync(process.execPath, [SCRIPT, dir], {
      encoding: 'utf8',
    });
    expect(run.status).toBe(0);
    expect(run.stdout).toContain(
      'build output clean: 3 script(s) checked, 2 under .cloudflare/output'
    );
  });

  it('exits non-zero from the command line on a marker', () => {
    const bad = app({
      '.cloudflare/output/v0/worker/index.js': 'x("unchecked-local")',
    });
    const good = app({ '.cloudflare/output/v0/worker/index.js': 'x()' });
    expect(spawnSync(process.execPath, [SCRIPT, bad]).status).toBe(1);
    expect(spawnSync(process.execPath, [SCRIPT, good]).status).toBe(0);
  });
});
