import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

test('Meet realtime CLI writes route-free config privately and preserves source-relative paths', () => {
  const temporary = mkdtempSync(join(tmpdir(), 'wave1-private-realtime-'));
  try {
    const source = join(temporary, 'apps/meet-realtime/hosted-staging.cf.json');
    const output = join(temporary, 'private-output');
    const original = readFileSync(
      new URL(
        '../../apps/meet-realtime/hosted-staging.cf.json',
        import.meta.url
      ),
      'utf8'
    );
    const config = JSON.parse(original);
    mkdirSync(dirname(source), { recursive: true });
    writeFileSync(source, original);
    for (const path of [config.main, ...Object.values(config.alias)]) {
      assert.equal(typeof path, 'string');
      const file = resolve(dirname(source), String(path));
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, '// disposable fixture');
    }
    execFileSync(
      process.execPath,
      [
        '--experimental-strip-types',
        fileURLToPath(new URL('./prepare.ts', import.meta.url)),
        'meet-realtime',
        output,
        source,
      ],
      {
        env: {
          WAVE1_STAGING_SUPABASE_PROJECT_REF: 's'.repeat(20),
          WAVE1_PRODUCTION_SUPABASE_PROJECT_REF: 'p'.repeat(20),
          NEXT_PUBLIC_SUPABASE_URL: `https://${'s'.repeat(20)}.supabase.co`,
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'public-fixture',
          NEXT_PUBLIC_APP_URL: 'https://meet.staging.tutur3u.com',
          NEXT_PUBLIC_WEB_APP_URL: 'https://staging.tutur3u.com',
          NEXT_PUBLIC_TUTURUUU_STAGING: '1',
          NEXT_PUBLIC_TUTURUUU_SHARED_COOKIE_DOMAIN: '.staging.tutur3u.com',
        },
        stdio: 'pipe',
      }
    );
    const candidate = join(output, 'hosted-staging.cf.json.route-free.json');
    assert.ok(
      existsSync(candidate),
      'Route-free realtime config must be in private output'
    );
    assert.equal(existsSync(`${source}.route-free.json`), false);
    assert.equal(readFileSync(source, 'utf8'), original);
    const prepared = JSON.parse(readFileSync(candidate, 'utf8'));
    assert.deepEqual(prepared.routes, []);
    assert.equal(prepared.main, resolve(dirname(source), config.main));
    assert.ok(existsSync(prepared.main));
    for (const [name, path] of Object.entries(config.alias)) {
      assert.equal(
        prepared.alias[name],
        resolve(dirname(source), String(path))
      );
      assert.ok(existsSync(prepared.alias[name]));
    }
    const {
      main: _main,
      alias: _alias,
      routes: _routes,
      ...retained
    } = prepared;
    const {
      main: _sourceMain,
      alias: _sourceAlias,
      routes: _sourceRoutes,
      ...expected
    } = config;
    assert.deepEqual(retained, expected);
    assert.equal(statSync(candidate).mode & 0o777, 0o600);
    assert.equal(statSync(output).mode & 0o777, 0o700);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
