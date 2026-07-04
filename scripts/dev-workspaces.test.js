const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  DEV_SERVICES,
  DEV_TARGETS,
  createDevPlan,
  getActivePortlessRouteHost,
  getPortlessAliasName,
  getPortlessHost,
  getServiceCommandEnv,
  isPortlessRouteActive,
  loadAppCatalog,
  parseArgs,
  parseDefaultPort,
  resolveAppStates,
  resolveServiceStates,
  runDevWorkspaces,
  spawnDevCommands,
} = require('./dev-workspaces');

const repoRoot = path.resolve(__dirname, '..');

function getBasePortlessUrl(app) {
  return `https://${getPortlessHost(app.routeName)}`;
}

test('parseDefaultPort extracts app fallback ports from dev:app scripts', () => {
  assert.equal(
    parseDefaultPort(
      'node ../../scripts/portless-dev-banner.js -- next dev -p $' +
        '{PORT:-7821} --turbopack'
    ),
    7821
  );
  assert.equal(parseDefaultPort('next dev -p 3000'), 3000);
  assert.equal(
    parseDefaultPort('vite dev --host 0.0.0.0 --port $' + '{PORT:-7824}'),
    7824
  );
  assert.equal(parseDefaultPort('vite dev --port 5173'), 5173);
  assert.equal(parseDefaultPort('bun --watch src/index.ts'), null);
});

test('loadAppCatalog reads package names, Portless route names, and fallback ports', () => {
  const catalog = loadAppCatalog({ rootDir: repoRoot });

  assert.deepEqual(catalog.web, {
    defaultPort: 7803,
    packageName: '@tuturuuu/web',
    path: 'apps/web',
    routeName: 'tuturuuu',
  });
  assert.deepEqual(catalog.chat, {
    defaultPort: 7821,
    packageName: '@tuturuuu/chat',
    path: 'apps/chat',
    routeName: 'chat.tuturuuu',
  });
  assert.deepEqual(catalog['tanstack-web'], {
    defaultPort: 7824,
    packageName: '@tuturuuu/tanstack-web',
    path: 'apps/tanstack-web',
    routeName: 'tanstack.tuturuuu',
  });
  assert.equal(catalog['hive-realtime'].defaultPort, null);
});

test('isPortlessRouteActive matches exact localhost route hosts', () => {
  const catalog = loadAppCatalog({ rootDir: repoRoot });
  const knownHosts = new Set(
    Object.values(catalog).map((app) => getPortlessHost(app.routeName))
  );
  const output = [
    'https://chat.tuturuuu.localhost -> http://127.0.0.1:4821',
    'https://tasks.tuturuuu.localhost -> http://127.0.0.1:4809',
  ].join('\n');

  assert.equal(
    getPortlessHost(catalog.chat.routeName),
    'chat.tuturuuu.localhost'
  );
  assert.equal(
    isPortlessRouteActive(catalog.chat, output, { knownHosts }),
    true
  );
  assert.equal(
    isPortlessRouteActive(catalog.web, output, { knownHosts }),
    false
  );
});

test('isPortlessRouteActive matches worktree-prefixed hosts without root false positives', () => {
  const catalog = loadAppCatalog({ rootDir: repoRoot });
  const knownHosts = new Set(
    Object.values(catalog).map((app) => getPortlessHost(app.routeName))
  );
  const output = [
    'https://zalo-qr-chat-setup.chat.tuturuuu.localhost -> http://127.0.0.1:4140',
    'https://chat.tuturuuu.localhost -> http://127.0.0.1:7821',
  ].join('\n');

  assert.equal(
    getActivePortlessRouteHost(catalog.chat, output, { knownHosts }),
    'zalo-qr-chat-setup.chat.tuturuuu.localhost'
  );
  assert.equal(
    isPortlessRouteActive(catalog.web, 'https://chat.tuturuuu.localhost', {
      knownHosts,
    }),
    false
  );
});

test('resolveAppStates reuses active Portless routes and starts missing apps', async () => {
  const catalog = loadAppCatalog({ rootDir: repoRoot });
  const states = await resolveAppStates(['chat', 'web'], {
    catalog,
    checkPort: async (port) => port === 4803,
    portlessListOutput: 'https://tuturuuu.localhost -> http://127.0.0.1:4803',
    registerAliases: false,
    resolvePortlessUrl: getBasePortlessUrl,
  });
  const plan = createDevPlan('chat', {
    appStates: states,
    catalog,
  });

  assert.equal(states.web.status, 'active');
  assert.equal(states.chat.status, 'missing');
  assert.equal(states.chat.url, 'https://chat.tuturuuu.localhost');
  assert.deepEqual(plan.skippedAppKeys, ['web']);
  assert.deepEqual(plan.missingAppKeys, ['chat']);
  assert.deepEqual(
    plan.appCommands.map((command) => command.appKey),
    ['chat']
  );
  assert.deepEqual(plan.appCommands[0].args, ['run', 'dev:app']);
  assert.equal(plan.appCommands[0].cwd, 'apps/chat');
  assert.ok(plan.sharedCommand.args.includes('@tuturuuu/types'));
  assert.ok(!plan.sharedCommand.args.includes('@tuturuuu/web'));
});

test('createDevPlan points started satellite apps at the reused web origin', async () => {
  const catalog = loadAppCatalog({ rootDir: repoRoot });
  const states = await resolveAppStates(['chat', 'web'], {
    catalog,
    checkPort: async (port) => port === 4803,
    portlessListOutput:
      'https://zalo-qr-chat-setup.tuturuuu.localhost -> http://127.0.0.1:4803',
    registerAliases: false,
    resolvePortlessUrl: (app) =>
      app.routeName === 'tuturuuu'
        ? 'https://zalo-qr-chat-setup.tuturuuu.localhost'
        : 'https://zalo-qr-chat-setup.chat.tuturuuu.localhost',
  });
  const plan = createDevPlan('chat', {
    appStates: states,
    catalog,
  });
  const [chatCommand] = plan.appCommands;

  assert.equal(chatCommand.appKey, 'chat');
  assert.deepEqual(chatCommand.env, {
    HOST: '127.0.0.1',
    INTERNAL_WEB_API_ORIGIN: 'https://zalo-qr-chat-setup.tuturuuu.localhost',
    NEXT_PUBLIC_WEB_APP_URL: 'https://zalo-qr-chat-setup.tuturuuu.localhost',
    PORT: '7821',
    PORTLESS_URL: 'https://zalo-qr-chat-setup.chat.tuturuuu.localhost',
    WEB_APP_URL: 'https://zalo-qr-chat-setup.tuturuuu.localhost',
  });
});

test('resolveServiceStates reuses fixed-port dev services', async () => {
  const states = await resolveServiceStates(['chat-realtime'], {
    checkPort: async (port) => port === 7817,
  });

  assert.deepEqual(states['chat-realtime'], {
    port: 7817,
    reason: 'localhost',
    status: 'active',
  });
});

test('createDevPlan starts chat realtime when only the sidecar is missing', async () => {
  const catalog = loadAppCatalog({ rootDir: repoRoot });
  const appStates = await resolveAppStates(['chat', 'web'], {
    catalog,
    checkPort: async (port) => port === 4821 || port === 4803,
    portlessListOutput: [
      'https://chat.tuturuuu.localhost -> http://127.0.0.1:4821',
      'https://tuturuuu.localhost -> http://127.0.0.1:4803',
    ].join('\n'),
    registerAliases: false,
    resolvePortlessUrl: getBasePortlessUrl,
  });
  const serviceStates = await resolveServiceStates(['chat-realtime'], {
    checkPort: async () => false,
  });
  const plan = createDevPlan('chat', {
    appStates,
    catalog,
    serviceCatalog: {
      'chat-realtime': {
        ...DEV_SERVICES['chat-realtime'],
        envFiles: [],
      },
    },
    serviceStates,
  });

  assert.equal(plan.sharedCommand, null);
  assert.deepEqual(plan.appCommands, []);
  assert.deepEqual(plan.serviceCommands, [
    {
      args: DEV_SERVICES['chat-realtime'].args,
      command: 'bun',
      cwd: undefined,
      env: { PORT: '7817' },
      label: 'chat realtime',
      serviceKey: 'chat-realtime',
    },
  ]);
  assert.deepEqual(plan.commands, plan.serviceCommands);
  assert.deepEqual(plan.skippedAppKeys, ['chat', 'web']);
  assert.deepEqual(plan.missingServiceKeys, ['chat-realtime']);
});

test('chat realtime service loads optional web env files without overriding shell env', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-workspaces-'));
  fs.mkdirSync(path.join(tempRoot, 'apps/web'), { recursive: true });
  fs.writeFileSync(
    path.join(tempRoot, 'apps/web/.env.local'),
    [
      'CHAT_REALTIME_TOKEN_SECRET=file-secret',
      'SUPABASE_SERVICE_ROLE_KEY="service-role-secret"',
      '',
    ].join('\n')
  );

  const env = getServiceCommandEnv(DEV_SERVICES['chat-realtime'], {
    env: { CHAT_REALTIME_TOKEN_SECRET: 'shell-secret' },
    rootDir: tempRoot,
  });

  assert.deepEqual(env, {
    CHAT_REALTIME_TOKEN_SECRET: 'shell-secret',
    PORT: '7817',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role-secret',
  });
});

test('resolveAppStates reuses base Portless routes when expected URLs are worktree-prefixed', async () => {
  const catalog = loadAppCatalog({ rootDir: repoRoot });
  const states = await resolveAppStates(['chat', 'web'], {
    catalog,
    checkPort: async (port) => port === 4821 || port === 4803,
    portlessListOutput: [
      'https://chat.tuturuuu.localhost -> http://127.0.0.1:4821',
      'https://tuturuuu.localhost -> http://127.0.0.1:4803',
    ].join('\n'),
    registerAliases: false,
    resolvePortlessUrl: (app) =>
      app.routeName === 'tuturuuu'
        ? 'https://zalo-qr-chat-setup.tuturuuu.localhost'
        : 'https://zalo-qr-chat-setup.chat.tuturuuu.localhost',
  });
  const plan = createDevPlan('chat', {
    appStates: states,
    catalog,
  });

  assert.equal(states.chat.status, 'active');
  assert.equal(states.chat.reason, 'portless');
  assert.equal(states.chat.url, 'https://chat.tuturuuu.localhost');
  assert.equal(states.web.status, 'active');
  assert.equal(states.web.url, 'https://tuturuuu.localhost');
  assert.deepEqual(plan.commands, []);
  assert.deepEqual(plan.skippedAppKeys, ['chat', 'web']);
});

test('resolveAppStates ignores stale Portless aliases whose target port is closed', async () => {
  const catalog = loadAppCatalog({ rootDir: repoRoot });
  const aliasCalls = [];
  const states = await resolveAppStates(['web'], {
    aliasRunner: (command, args) => {
      aliasCalls.push([command, args]);
      return { status: 0, stderr: '', stdout: 'registered' };
    },
    catalog,
    checkPort: async () => false,
    portlessListOutput:
      'https://tuturuuu.localhost -> http://127.0.0.1:7803 (alias)',
    resolvePortlessUrl: getBasePortlessUrl,
  });
  const plan = createDevPlan('web', {
    appStates: states,
    catalog,
  });

  assert.equal(states.web.status, 'missing');
  assert.equal(states.web.reason, 'not-running');
  assert.deepEqual(states.web.alias, {
    ok: true,
    output: 'registered',
  });
  assert.deepEqual(plan.missingAppKeys, ['web']);
  assert.deepEqual(plan.appCommands[0].args, ['run', 'dev:app']);
  assert.deepEqual(aliasCalls, [
    ['bunx', ['portless', 'alias', '--remove', 'tuturuuu']],
    ['bunx', ['portless', 'alias', 'tuturuuu', '7803']],
  ]);
});

test('resolveAppStates removes stale worktree-prefixed aliases for the same app', async () => {
  const catalog = loadAppCatalog({ rootDir: repoRoot });
  const aliasCalls = [];
  const states = await resolveAppStates(['web'], {
    aliasRunner: (command, args) => {
      aliasCalls.push([command, args]);
      return { status: 0, stderr: '', stdout: 'ok' };
    },
    catalog,
    checkPort: async () => false,
    portlessListOutput: [
      'http://zalo-qr-chat-setup.tuturuuu.localhost:1355 -> localhost:7803 (alias)',
      'http://zalo-qr-chat-setup.chat.tuturuuu.localhost:1355 -> localhost:7821 (alias)',
    ].join('\n'),
    resolvePortlessUrl: getBasePortlessUrl,
  });

  assert.deepEqual(states.web.aliasCleanup, [
    {
      aliasName: 'zalo-qr-chat-setup.tuturuuu',
      host: 'zalo-qr-chat-setup.tuturuuu.localhost',
      ok: true,
      output: 'ok',
      port: 7803,
    },
  ]);
  assert.deepEqual(aliasCalls, [
    ['bunx', ['portless', 'alias', '--remove', 'zalo-qr-chat-setup.tuturuuu']],
    ['bunx', ['portless', 'alias', 'tuturuuu', '7803']],
  ]);
});

test('resolveAppStates reuses direct localhost listeners and registers Portless aliases', async () => {
  const catalog = loadAppCatalog({ rootDir: repoRoot });
  const aliasCalls = [];
  const states = await resolveAppStates(['web'], {
    aliasRunner: (command, args) => {
      aliasCalls.push([command, args]);
      return { status: 0, stderr: '', stdout: 'registered' };
    },
    catalog,
    checkPort: async (port) => port === 7803,
    portlessListOutput: '',
    resolvePortlessUrl: () => 'https://zalo-qr-chat-setup.tuturuuu.localhost',
  });

  assert.equal(states.web.status, 'active');
  assert.equal(states.web.reason, 'localhost');
  assert.deepEqual(aliasCalls, [
    ['bunx', ['portless', 'alias', 'zalo-qr-chat-setup.tuturuuu', '7803']],
  ]);
});

test('resolveAppStates registers expected Portless aliases for missing direct app starts', async () => {
  const catalog = loadAppCatalog({ rootDir: repoRoot });
  const aliasCalls = [];
  const states = await resolveAppStates(['chat'], {
    aliasRunner: (command, args) => {
      aliasCalls.push([command, args]);
      return { status: 0, stderr: '', stdout: 'registered' };
    },
    catalog,
    checkPort: async () => false,
    portlessListOutput: '',
    resolvePortlessUrl: () =>
      'https://zalo-qr-chat-setup.chat.tuturuuu.localhost',
  });

  assert.equal(states.chat.status, 'missing');
  assert.equal(states.chat.reason, 'not-running');
  assert.equal(states.chat.staleAlias, null);
  assert.deepEqual(states.chat.alias, {
    ok: true,
    output: 'registered',
  });
  assert.deepEqual(aliasCalls, [
    ['bunx', ['portless', 'alias', 'zalo-qr-chat-setup.chat.tuturuuu', '7821']],
  ]);
});

test('getPortlessAliasName targets worktree-prefixed aliases when present', () => {
  const catalog = loadAppCatalog({ rootDir: repoRoot });

  assert.equal(
    getPortlessAliasName(
      catalog.chat,
      'https://zalo-qr-chat-setup.chat.tuturuuu.localhost'
    ),
    'zalo-qr-chat-setup.chat.tuturuuu'
  );
  assert.equal(
    getPortlessAliasName(catalog.web, 'https://tuturuuu.localhost'),
    'tuturuuu'
  );
});

test('force mode includes already-running app workspaces', async () => {
  const catalog = loadAppCatalog({ rootDir: repoRoot });
  const states = await resolveAppStates(['chat', 'web'], {
    catalog,
    checkPort: async () => true,
    forceStart: true,
    portlessListOutput: 'https://tuturuuu.localhost -> http://127.0.0.1:4803',
    resolvePortlessUrl: getBasePortlessUrl,
  });
  const plan = createDevPlan('chat', {
    appStates: states,
    catalog,
    forceStart: true,
  });

  assert.deepEqual(plan.skippedAppKeys, []);
  assert.deepEqual(plan.missingAppKeys, ['chat', 'web']);
  assert.deepEqual(
    plan.appCommands.map((command) => command.appKey),
    ['chat', 'web']
  );
  assert.deepEqual(
    plan.appCommands.map((command) => command.args),
    [
      ['run', 'dev', '--force'],
      ['run', 'dev', '--force'],
    ]
  );
  assert.deepEqual(plan.appCommands[0].env, {
    HOST: '127.0.0.1',
    INTERNAL_WEB_API_ORIGIN: 'https://tuturuuu.localhost',
    NEXT_PUBLIC_WEB_APP_URL: 'https://tuturuuu.localhost',
    PORT: '7821',
    PORTLESS_URL: 'https://chat.tuturuuu.localhost',
    WEB_APP_URL: 'https://tuturuuu.localhost',
  });
  assert.deepEqual(plan.appCommands[1].env, {
    HOST: '127.0.0.1',
    PORT: '7803',
    PORTLESS_URL: 'https://tuturuuu.localhost',
  });
});

test('force mode carries worktree-prefixed Portless origins into started apps', async () => {
  const catalog = loadAppCatalog({ rootDir: repoRoot });
  const states = await resolveAppStates(['chat', 'web'], {
    catalog,
    checkPort: async () => true,
    forceStart: true,
    portlessListOutput:
      'https://zalo-qr-chat-setup.tuturuuu.localhost -> http://127.0.0.1:4803',
    resolvePortlessUrl: (app) =>
      app.routeName === 'tuturuuu'
        ? 'https://zalo-qr-chat-setup.tuturuuu.localhost'
        : 'https://zalo-qr-chat-setup.chat.tuturuuu.localhost',
  });
  const plan = createDevPlan('chat', {
    appStates: states,
    catalog,
    forceStart: true,
  });

  assert.deepEqual(
    plan.appCommands.map((command) => command.args),
    [
      ['run', 'dev', '--force'],
      ['run', 'dev', '--force'],
    ]
  );
  assert.deepEqual(plan.appCommands[0].env, {
    HOST: '127.0.0.1',
    INTERNAL_WEB_API_ORIGIN: 'https://zalo-qr-chat-setup.tuturuuu.localhost',
    NEXT_PUBLIC_WEB_APP_URL: 'https://zalo-qr-chat-setup.tuturuuu.localhost',
    PORT: '7821',
    PORTLESS_URL: 'https://zalo-qr-chat-setup.chat.tuturuuu.localhost',
    WEB_APP_URL: 'https://zalo-qr-chat-setup.tuturuuu.localhost',
  });
  assert.deepEqual(plan.appCommands[1].env, {
    HOST: '127.0.0.1',
    PORT: '7803',
    PORTLESS_URL: 'https://zalo-qr-chat-setup.tuturuuu.localhost',
  });
});

test('createDevPlan passes the Portless CA to direct app commands when available', async () => {
  const catalog = loadAppCatalog({ rootDir: repoRoot });
  const states = await resolveAppStates(['chat', 'web'], {
    catalog,
    checkPort: async () => false,
    portlessListOutput: '',
    registerAliases: false,
    resolvePortlessUrl: getBasePortlessUrl,
  });
  const plan = createDevPlan('chat', {
    appStates: states,
    catalog,
    portlessCaCertPath: '/tmp/portless-ca.pem',
  });

  assert.equal(
    plan.appCommands[0].env.NODE_EXTRA_CA_CERTS,
    '/tmp/portless-ca.pem'
  );
  assert.equal(
    plan.appCommands[1].env.NODE_EXTRA_CA_CERTS,
    '/tmp/portless-ca.pem'
  );
});

test('createDevPlan exits when every app workspace is already reusable', async () => {
  const catalog = loadAppCatalog({ rootDir: repoRoot });
  const states = await resolveAppStates(['learn', 'teach', 'web'], {
    catalog,
    checkPort: async (port) => [4812, 4813, 4803].includes(port),
    portlessListOutput: [
      'https://learn.tuturuuu.localhost -> http://127.0.0.1:4812',
      'https://teach.tuturuuu.localhost -> http://127.0.0.1:4813',
      'https://tuturuuu.localhost -> http://127.0.0.1:4803',
    ].join('\n'),
    registerAliases: false,
    resolvePortlessUrl: getBasePortlessUrl,
  });
  const plan = createDevPlan('edu', {
    appStates: states,
    catalog,
  });

  assert.equal(plan.sharedCommand, null);
  assert.deepEqual(plan.commands, []);
  assert.deepEqual(plan.skippedAppKeys, ['learn', 'teach', 'web']);
});

test('createDevPlan separates shared watchers from sequential app starts', async () => {
  const catalog = loadAppCatalog({ rootDir: repoRoot });
  const states = await resolveAppStates(['learn', 'teach', 'web'], {
    catalog,
    checkPort: async () => false,
    portlessListOutput: '',
    registerAliases: false,
    resolvePortlessUrl: getBasePortlessUrl,
  });
  const plan = createDevPlan('edu', {
    appStates: states,
    catalog,
    turboArgs: ['--summarize'],
  });

  assert.equal(plan.sharedCommand.command, 'bun');
  assert.deepEqual(plan.sharedCommand.args, [
    'turbo:local',
    'run',
    'dev',
    '-F',
    '@tuturuuu/types',
    '-F',
    '@tuturuuu/supabase',
    '--summarize',
  ]);
  assert.deepEqual(
    plan.appCommands.map((command) => command.args),
    [
      ['run', 'dev:app'],
      ['run', 'dev:app'],
      ['run', 'dev:app'],
    ]
  );
  assert.deepEqual(
    plan.appCommands.map((command) => command.cwd),
    ['apps/learn', 'apps/teach', 'apps/web']
  );
  assert.deepEqual(
    plan.commands.map((command) => command.label),
    ['shared package watchers', 'learn', 'teach', 'web']
  );
});

test('createDevPlan can skip shared package watchers for lean app startup', async () => {
  const catalog = loadAppCatalog({ rootDir: repoRoot });
  const states = await resolveAppStates(['web'], {
    catalog,
    checkPort: async () => false,
    portlessListOutput: '',
    registerAliases: false,
    resolvePortlessUrl: getBasePortlessUrl,
  });
  const plan = createDevPlan('web', {
    appStates: states,
    catalog,
    includeSharedWatchers: false,
  });

  assert.equal(plan.sharedCommand, null);
  assert.deepEqual(plan.sharedFilters, []);
  assert.deepEqual(plan.skippedSharedFilters, [
    '@tuturuuu/types',
    '@tuturuuu/supabase',
  ]);
  assert.deepEqual(
    plan.commands.map((command) => command.label),
    ['web']
  );
});

test('parseArgs consumes reuse flags and forwards other Turbo args', () => {
  assert.deepEqual(parseArgs(['chat', '--force', '--parallel']), {
    dryRun: false,
    forceStart: true,
    includeSharedWatchers: null,
    targetName: 'chat',
    turboArgs: ['--parallel'],
  });
  assert.deepEqual(parseArgs(['chat', '--no-reuse', '--dry-run']), {
    dryRun: true,
    forceStart: true,
    includeSharedWatchers: null,
    targetName: 'chat',
    turboArgs: [],
  });
  assert.deepEqual(parseArgs(['web', '--with-shared-watchers']), {
    dryRun: false,
    forceStart: false,
    includeSharedWatchers: true,
    targetName: 'web',
    turboArgs: [],
  });
  assert.deepEqual(parseArgs(['web', '--no-shared-watchers', '--summarize']), {
    dryRun: false,
    forceStart: false,
    includeSharedWatchers: false,
    targetName: 'web',
    turboArgs: ['--summarize'],
  });
});

test('runDevWorkspaces web dry run skips shared package watchers by default', async () => {
  let setupCalled = false;
  const aliasCalls = [];
  const output = {
    stderr: '',
    stdout: '',
  };
  const writeTo = (key) => ({
    write: (value) => {
      output[key] += value.toString();
    },
  });

  const exitCode = await runDevWorkspaces({
    aliasRunner: (command, args) => {
      aliasCalls.push([command, args]);
      return { status: 0, stderr: '', stdout: '' };
    },
    argv: ['web', '--dry-run'],
    checkPort: async () => false,
    getPortlessListOutputImpl: () =>
      'http://tuturuuu.localhost:1355 -> localhost:7803 (alias)',
    setupPortless: () => {
      setupCalled = true;
      return 0;
    },
    spawnImpl: () => {
      throw new Error('dry run should not spawn commands');
    },
    stderr: writeTo('stderr'),
    stdout: writeTo('stdout'),
  });

  assert.equal(exitCode, 0);
  assert.equal(setupCalled, false);
  assert.deepEqual(aliasCalls, []);
  assert.match(output.stdout, /Starting dev:web/u);
  assert.match(output.stdout, /Skipping shared package watchers for dev:web/u);
  assert.doesNotMatch(output.stdout, /shared package watchers: bun/u);
});

test('runDevWorkspaces web dry run can include shared package watchers', async () => {
  const output = {
    stderr: '',
    stdout: '',
  };
  const writeTo = (key) => ({
    write: (value) => {
      output[key] += value.toString();
    },
  });

  const exitCode = await runDevWorkspaces({
    argv: ['web', '--dry-run', '--with-shared-watchers'],
    checkPort: async () => false,
    getPortlessListOutputImpl: () => '',
    setupPortless: () => {
      throw new Error('dry run should not start Portless');
    },
    spawnImpl: () => {
      throw new Error('dry run should not spawn commands');
    },
    stderr: writeTo('stderr'),
    stdout: writeTo('stdout'),
  });

  assert.equal(exitCode, 0);
  assert.match(output.stdout, /shared package watchers: bun/u);
});

test('spawnDevCommands retries Portless route-lock app startup once', async () => {
  const writes = {
    stderr: '',
    stdout: '',
  };
  const writeTo = (key) => ({
    write: (value) => {
      writes[key] += value.toString();
    },
  });
  const children = [];
  const createChild = () => {
    const child = new EventEmitter();

    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.exitCode = null;
    child.signalCode = null;
    child.kill = () => {
      child.killed = true;
    };
    children.push(child);

    return child;
  };
  const spawnCalls = [];
  const exitPromise = spawnDevCommands({
    commands: [
      {
        appKey: 'chat',
        args: ['run', 'dev'],
        command: 'bun',
        cwd: 'apps/chat',
        label: 'chat',
      },
    ],
    routeLockExitTimeoutMs: 100,
    routeLockRetryDelayMs: 0,
    rootDir: repoRoot,
    spawnImpl: (command, args) => {
      const child = createChild();

      spawnCalls.push([command, args]);

      if (spawnCalls.length === 1) {
        process.nextTick(() => {
          child.stdout.emit('data', Buffer.from('-- Using port 4247\n'));
        });
        setImmediate(() => {
          child.stderr.emit(
            'data',
            Buffer.from('Failed to acquire route lock\n')
          );
          child.exitCode = 1;
          child.emit('exit', 1, null);
        });
      } else {
        process.nextTick(() => {
          child.stdout.emit('data', Buffer.from('-- Using port 4518\n'));
          child.exitCode = 0;
          child.emit('exit', 0, null);
        });
      }

      return child;
    },
    stderr: writeTo('stderr'),
    stdout: writeTo('stdout'),
  });

  assert.equal(await exitPromise, 0);
  assert.deepEqual(spawnCalls, [
    ['bun', ['run', 'dev']],
    ['bun', ['run', 'dev']],
  ]);
  assert.equal(children.length, 2);
  assert.match(writes.stderr, /Failed to acquire route lock/u);
  assert.match(
    writes.stdout,
    /Retrying chat after Portless route lock clears/u
  );
  assert.match(writes.stdout, /-- Using port 4518/u);
});

test('root app dev scripts route through the reusable workspace launcher', () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8')
  );

  for (const targetName of Object.keys(DEV_TARGETS).sort()) {
    assert.equal(
      pkg.scripts[`dev:${targetName}`],
      `node scripts/dev-workspaces.js ${targetName}`
    );
  }
});
