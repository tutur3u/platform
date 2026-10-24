import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  adbReversePorts,
  dockerEnv,
  dummyGoogleServicesJson,
  formatEnvFile,
  isolatedDockerConfigJson,
  MOBILE_API_OVERRIDE_KEYS,
  mobileDefines,
  parseCliArgs,
  parseShotMarker,
  parseSupabaseStatus,
  playwrightEnv,
  resolveConfig,
  webEnv,
} from './lib.mjs';

const status = parseSupabaseStatus({
  API_URL: 'http://127.0.0.1:8001',
  DB_URL: 'postgresql://postgres:postgres@127.0.0.1:8002/postgres',
  PUBLISHABLE_KEY: 'local-publishable',
  SECRET_KEY: 'local-secret',
});

describe('resolveConfig', () => {
  it('defaults to an isolated project and port block under ci-lanes', () => {
    const config = resolveConfig({}, { home: '/Users/thanh' });
    assert.equal(config.projectId, 'tuturuuu-e2e');
    assert.equal(config.supabaseApiPort, 8001);
    assert.equal(config.supabaseBasePort, 8000);
    assert.equal(config.webPort, 7803);
    assert.equal(
      config.stateDir,
      '/Users/thanh/ci-lanes/tuturuuu-tools/e2e/tuturuuu-e2e'
    );
  });

  it('refuses the default sb:start project id and overlapping ports', () => {
    assert.throws(
      () => resolveConfig({ TUTURUUU_E2E_PROJECT_ID: 'tuturuuu' }),
      /collides/
    );
    assert.throws(
      () => resolveConfig({ TUTURUUU_E2E_WEB_PORT: '8003' }),
      /overlaps/
    );
    assert.throws(
      () => resolveConfig({ TUTURUUU_E2E_SUPABASE_BASE_PORT: '80' }),
      /between 1024/
    );
  });
});

describe('dockerEnv', () => {
  it('uses an isolated credential-free config and the desktop socket', () => {
    const config = resolveConfig({}, { home: '/Users/thanh' });
    const env = dockerEnv(config, {});
    assert.equal(env.DOCKER_CONFIG, config.dockerConfigDir);
    assert.match(env.DOCKER_HOST, /^unix:\/\/.*docker\.sock$/);
    assert.deepEqual(JSON.parse(isolatedDockerConfigJson()), { auths: {} });
  });
});

describe('parseSupabaseStatus', () => {
  it('accepts legacy anon/service key names', () => {
    const legacy = parseSupabaseStatus({
      API_URL: 'http://127.0.0.1:8001',
      ANON_KEY: 'anon',
      SERVICE_ROLE_KEY: 'service',
    });
    assert.equal(legacy.publishableKey, 'anon');
    assert.equal(legacy.secretKey, 'service');
  });

  it('fails closed when keys are missing', () => {
    assert.throws(
      () => parseSupabaseStatus({ API_URL: 'http://127.0.0.1:1' }),
      /missing/
    );
  });
});

describe('env derivation', () => {
  const config = resolveConfig({}, { home: '/Users/thanh' });

  it('points web at the loopback stack', () => {
    const env = webEnv(config, status);
    assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, 'http://127.0.0.1:8001');
    assert.equal(env.PORT, '7803');
    assert.equal(env.TUTURUUU_LOCAL_E2E_AUTH_BYPASS, '1');
  });

  it('targets Playwright at the guard-approved loopback web origin', () => {
    const env = playwrightEnv(config, status);
    assert.equal(env.BASE_URL, 'http://localhost:7803');
  });

  it('routes every mobile API owner to the local web server via 127.0.0.1', () => {
    const defines = mobileDefines(config, {
      ...status,
      apiUrl: 'http://localhost:8001',
    });
    assert.equal(defines.NEXT_PUBLIC_SUPABASE_URL, 'http://127.0.0.1:8001');
    for (const key of MOBILE_API_OVERRIDE_KEYS) {
      assert.equal(defines[key], 'http://127.0.0.1:7803');
    }
    assert.equal(defines.TURNSTILE_SITE_KEY, '');
    assert.deepEqual(adbReversePorts(config), [7803, 8001]);
  });

  it('refuses a non-loopback Supabase URL', () => {
    assert.throws(
      () => webEnv(config, { ...status, apiUrl: 'https://x.supabase.co' }),
      /non-loopback/
    );
  });

  it('formats env files one key per line', () => {
    assert.equal(formatEnvFile({ A: '1', B: 'x\ny' }), 'A=1\nB=xy\n');
  });
});

describe('dummyGoogleServicesJson', () => {
  it('covers every flavor package with synthetic values only', () => {
    const json = JSON.parse(dummyGoogleServicesJson());
    assert.deepEqual(
      json.client.map((c) => c.client_info.android_client_info.package_name),
      [
        'com.tuturuuu.app.mobile',
        'com.tuturuuu.app.mobile.dev',
        'com.tuturuuu.app.mobile.stg',
      ]
    );
    assert.equal(json.client[1].api_key[0].current_key, 'dummy_key');
  });
});

describe('parseShotMarker', () => {
  it('extracts safe names from Android and iOS log lines', () => {
    assert.equal(
      parseShotMarker('I/flutter ( 6351): E2E_SHOT android-04-agenda'),
      'android-04-agenda'
    );
    assert.equal(
      parseShotMarker('flutter: E2E_SHOT ios-01-launch'),
      'ios-01-launch'
    );
    assert.equal(parseShotMarker('E2E_SHOT ../etc'), null);
    assert.equal(parseShotMarker('unrelated'), null);
  });
});

describe('parseCliArgs', () => {
  it('parses flags and positionals', () => {
    assert.deepEqual(
      parseCliArgs(['mobile-e2e', 'android', '--mode=profile']),
      {
        command: 'mobile-e2e',
        flags: { mode: 'profile' },
        positionals: ['android'],
      }
    );
    assert.deepEqual(parseCliArgs(['web-e2e', '--', '--grep', 'auth']), {
      command: 'web-e2e',
      flags: {},
      positionals: ['--grep', 'auth'],
    });
  });

  it('rejects unknown commands and maps no command to help', () => {
    assert.throws(() => parseCliArgs(['launch']), /Unknown command/);
    assert.equal(parseCliArgs([]).command, 'help');
  });
});
