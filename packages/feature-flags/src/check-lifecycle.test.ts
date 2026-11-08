import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const script = fileURLToPath(
  new URL('../scripts/check-lifecycle.mjs', import.meta.url)
);
const fixtureDir = mkdtempSync(join(tmpdir(), 'feature-flag-lifecycle-'));
afterAll(() => rmSync(fixtureDir, { force: true, recursive: true }));

const environments = ['development', 'staging', 'production'];
const flag = {
  key: 'new_feature',
  family: 'mobile-runtime',
  kind: 'release',
  scope: 'global',
  description: 'Gate a new feature.',
  owner: 'owner',
  createdAt: '2026-11-01',
  apps: ['web'],
  appsComplete: true,
  sources: ['config/feature-flags.json'],
  defaults: { development: false, staging: false, production: false },
  verifiedOnProdAt: '2026-11-08T04:00:00Z',
  legacy: false,
};

function writeCatalog(name: string, flags: unknown[]) {
  const path = join(fixtureDir, `${name}.json`);
  writeFileSync(path, JSON.stringify({ environments, flags }));
  return path;
}

function run(...args: string[]) {
  const result = spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
  });
  return { code: result.status, output: `${result.stdout}${result.stderr}` };
}

describe('check-lifecycle', () => {
  const overdue = writeCatalog('overdue', [flag]);
  const malformed = writeCatalog('malformed', [{ ...flag, owner: null }]);

  it('passes the committed catalog in strict mode', () => {
    const result = run('--strict', '--now', '2026-11-08T00:00:00Z');
    expect(result.code).toBe(0);
    expect(result.output).toContain('0 metadata issues, 0 overdue.');
  });

  it('warns without failing on overdue flags by default', () => {
    const result = run('--catalog', overdue, '--now', '2026-11-10T04:00:01Z');
    expect(result.code).toBe(0);
    expect(result.output).toContain(
      '::warning title=Feature flag overdue::new_feature (mobile-runtime) was due for removal at 2026-11-10T04:00:00.000Z'
    );
  });

  it('fails strict mode on overdue flags and malformed metadata', () => {
    expect(
      run('--strict', '--catalog', overdue, '--now', '2026-11-10T04:00:01Z')
        .code
    ).toBe(1);
    const result = run('--strict', '--catalog', malformed);
    expect(result.code).toBe(1);
    expect(result.output).toContain(
      '::error title=Feature flag metadata::new_feature: new flags require an owner'
    );
  });

  it('keeps flags at the 48-hour boundary out of the overdue report', () => {
    const result = run(
      '--strict',
      '--catalog',
      overdue,
      '--now',
      '2026-11-10T04:00:00Z'
    );
    expect(result.code).toBe(0);
  });

  it('rejects unusable arguments', () => {
    expect(run('--now', 'yesterday').code).toBe(2);
    expect(run('--unknown').code).toBe(2);
  });
});
