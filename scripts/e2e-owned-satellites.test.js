const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');

const {
  createOwnedSatelliteEnv,
  getOwnedSatelliteDependencyBuildArgs,
  getOwnedSatellitePortlessEnv,
  getOwnedSatelliteReadinessUrl,
  getOwnedSatellitesPlaywrightEnv,
  getOwnedSatelliteUrl,
  getRequiredOwnedSatellites,
  OWNED_E2E_SATELLITES,
  shouldDiscoverOwnedSatellitesFromTestList,
  startOwnedSatellite,
  waitForOwnedSatellite,
} = require('./e2e-owned-satellites.js');

const forms = OWNED_E2E_SATELLITES.find(
  (satellite) => satellite.appName === 'forms'
);
const contacts = OWNED_E2E_SATELLITES.find(
  (satellite) => satellite.appName === 'contacts'
);
const finance = OWNED_E2E_SATELLITES.find(
  (satellite) => satellite.appName === 'finance'
);
const infrastructure = OWNED_E2E_SATELLITES.find(
  (satellite) => satellite.appName === 'infrastructure'
);
const mail = OWNED_E2E_SATELLITES.find(
  (satellite) => satellite.appName === 'mail'
);

test('selects only satellite owners present in a Playwright shard', () => {
  assert.deepEqual(
    getRequiredOwnedSatellites(
      ['--shard=1/4'],
      {},
      'forms-private.noauth.spec.ts'
    ).map((satellite) => satellite.appName),
    ['forms']
  );
  assert.deepEqual(
    getRequiredOwnedSatellites(
      ['--shard=3/4'],
      {},
      'ai-credits.spec.ts tasks-workspace-lifecycle.noauth.spec.ts'
    ).map((satellite) => satellite.appName),
    ['infrastructure']
  );
  assert.deepEqual(
    getRequiredOwnedSatellites(
      ['--shard=4/4'],
      {},
      'workspace-invite-cross-app-access.noauth.spec.ts'
    ).map((satellite) => satellite.appName),
    ['contacts', 'finance']
  );
  assert.deepEqual(
    getRequiredOwnedSatellites(
      ['workspace-invite-account-shapes.noauth.spec.ts'],
      {}
    ).map((satellite) => satellite.appName),
    ['contacts', 'finance']
  );
  assert.deepEqual(
    getRequiredOwnedSatellites(
      ['workspace-invite-mail-access.noauth.spec.ts'],
      {}
    ).map((satellite) => satellite.appName),
    ['mail']
  );
  assert.deepEqual(
    getRequiredOwnedSatellites(['public-marketing-routes.noauth.spec.ts'], {}),
    []
  );
});

test('supports explicit satellite enable and disable controls', () => {
  assert.deepEqual(
    getRequiredOwnedSatellites(['--shard=1/4'], {
      E2E_FORMS_SATELLITE_ENABLED: '0',
      E2E_INFRASTRUCTURE_SATELLITE_ENABLED: '1',
    }).map((satellite) => satellite.appName),
    ['infrastructure']
  );
  assert.equal(
    shouldDiscoverOwnedSatellitesFromTestList(['--shard=1/4'], {
      E2E_CONTACTS_SATELLITE_ENABLED: '0',
      E2E_FINANCE_SATELLITE_ENABLED: '0',
      E2E_FORMS_SATELLITE_ENABLED: '0',
      E2E_INFRASTRUCTURE_SATELLITE_ENABLED: '0',
      E2E_MAIL_SATELLITE_ENABLED: '0',
    }),
    false
  );
});

test('builds host-safe owned-satellite runtime environments', () => {
  const env = {
    BASE_URL: 'https://tuturuuu.localhost:1355',
    DOCKER_WEB_PROXY_HOST_PORT: '7803',
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:8001',
    PORTLESS_PORT: '1355',
  };

  assert.equal(
    getOwnedSatelliteUrl(forms, env),
    'https://forms.tuturuuu.localhost:1355'
  );
  assert.equal(
    getOwnedSatelliteUrl(contacts, env),
    'https://contacts.tuturuuu.localhost:1355'
  );
  assert.equal(
    getOwnedSatelliteUrl(finance, env),
    'https://finance.tuturuuu.localhost:1355'
  );
  assert.equal(
    getOwnedSatelliteReadinessUrl(contacts),
    'http://127.0.0.1:7827'
  );
  assert.equal(getOwnedSatelliteReadinessUrl(finance), 'http://127.0.0.1:7808');
  assert.deepEqual(getOwnedSatelliteDependencyBuildArgs(finance), [
    'turbo:local',
    'run',
    'build',
    '--filter=@tuturuuu/finance^...',
  ]);
  assert.equal(
    getOwnedSatelliteUrl(infrastructure, env),
    'https://infra.tuturuuu.localhost:1355'
  );
  assert.equal(
    getOwnedSatelliteUrl(mail, env),
    'https://mail.tuturuuu.localhost:1355'
  );
  assert.equal(getOwnedSatelliteReadinessUrl(mail), 'http://127.0.0.1:7820');
  assert.equal(getOwnedSatelliteReadinessUrl(forms), 'http://127.0.0.1:7828');
  assert.deepEqual(getOwnedSatelliteDependencyBuildArgs(forms), [
    'turbo:local',
    'run',
    'build',
    '--filter=@tuturuuu/forms^...',
  ]);

  const formsRuntime = createOwnedSatelliteEnv(forms, env);
  assert.equal(
    formsRuntime.FORMS_APP_URL,
    'https://forms.tuturuuu.localhost:1355'
  );
  assert.equal(formsRuntime.INTERNAL_WEB_API_ORIGIN, 'http://127.0.0.1:7803');
  assert.equal(formsRuntime.NEXT_WEBPACK_BUILD, '1');
  assert.equal(formsRuntime.SUPABASE_SERVER_URL, 'http://127.0.0.1:8001');

  const infraPortless = getOwnedSatellitePortlessEnv(infrastructure, env);
  assert.equal(infraPortless.PORTLESS_ROUTE_NAME, 'infra.tuturuuu');
  assert.equal(infraPortless.DOCKER_WEB_PROXY_HOST_PORT, '7823');

  const playwright = getOwnedSatellitesPlaywrightEnv(
    [contacts, finance, forms, infrastructure, mail],
    env
  );
  assert.equal(
    playwright.FORMS_BASE_URL,
    'https://forms.tuturuuu.localhost:1355'
  );
  assert.equal(
    playwright.CONTACTS_BASE_URL,
    'https://contacts.tuturuuu.localhost:1355'
  );
  assert.equal(
    playwright.FINANCE_BASE_URL,
    'https://finance.tuturuuu.localhost:1355'
  );
  assert.equal(
    playwright.INFRASTRUCTURE_BASE_URL,
    'https://infra.tuturuuu.localhost:1355'
  );
  assert.equal(
    playwright.MAIL_BASE_URL,
    'https://mail.tuturuuu.localhost:1355'
  );

  const mailRuntime = createOwnedSatelliteEnv(mail, env);
  assert.equal(
    mailRuntime.MAIL_APP_URL,
    'https://mail.tuturuuu.localhost:1355'
  );
  assert.equal(
    mailRuntime.NEXT_PUBLIC_MAIL_APP_URL,
    'https://mail.tuturuuu.localhost:1355'
  );
});

test('starts an owned satellite and reports an early readiness exit', async () => {
  const child = new EventEmitter();
  child.exitCode = null;
  child.kill = () => true;
  const calls = [];
  const closedFds = [];
  const runtime = startOwnedSatellite(forms, {
    env: { PORTLESS_PORT: '1355' },
    fsImpl: {
      closeSync(fd) {
        closedFds.push(fd);
      },
      mkdirSync() {},
      openSync() {
        return 42;
      },
    },
    rootDir: '/repo',
    spawnImpl(command, args, options) {
      calls.push({ args, command, options });
      return child;
    },
  });

  assert.equal(calls[0].command, 'bunx');
  assert.deepEqual(calls[0].args, ['next', 'dev', '-p', '7828', '--webpack']);
  assert.equal(calls[0].options.cwd, '/repo/apps/forms');
  assert.equal(calls[0].options.env.PORT, '7828');
  assert.equal(runtime.readinessUrl, 'http://127.0.0.1:7828');
  assert.deepEqual(calls[0].options.stdio, ['ignore', 42, 42]);
  assert.deepEqual(closedFds, [42]);

  const readiness = waitForOwnedSatellite(runtime, () => new Promise(() => {}));
  child.emit('exit', 1, null);
  await assert.rejects(
    readiness,
    /forms satellite stopped before it became ready.*exit=1/u
  );
});
