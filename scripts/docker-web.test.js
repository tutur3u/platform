const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  BLUE_GREEN_PROXY_SERVICE,
  COMPOSE_FILE,
  DOCKER_HOST_ALIAS,
  PROD_COMPOSE_FILE,
  WEB_ENV_FILE,
  clearBlueGreenRuntime,
  getBlueGreenPaths,
  getComposeEnvironment,
  getComposeFile,
  parseArgs,
  parseEnvFile,
  readBlueGreenActiveColor,
  renderBlueGreenProxyConfig,
  rewriteLocalhostUrl,
  runDockerWebWorkflow,
  usesBlueGreenStrategy,
  writeBlueGreenActiveColor,
} = require('./docker-web.js');

function createFsStub({ envFileContent = '', hasEnvFile = true } = {}) {
  return {
    existsSync(targetPath) {
      if (targetPath === WEB_ENV_FILE) {
        return hasEnvFile;
      }

      return false;
    },
    mkdirSync() {},
    readFileSync(targetPath) {
      if (targetPath !== WEB_ENV_FILE) {
        throw new Error(`Unexpected read for ${targetPath}`);
      }

      return envFileContent;
    },
    rmSync() {},
    writeFileSync() {},
  };
}

test('parseArgs keeps redis profile before the compose action', () => {
  assert.deepEqual(parseArgs(['up', '--profile', 'redis', '-d']), {
    action: 'up',
    composeArgs: ['-d'],
    composeGlobalArgs: ['--profile', 'redis'],
    mode: 'dev',
    resetSupabase: false,
    strategy: 'in-place',
    withSupabase: false,
  });
});

test('parseArgs accepts prod mode and blue-green strategy', () => {
  assert.deepEqual(
    parseArgs(['up', '--mode', 'prod', '--strategy', 'blue-green']),
    {
      action: 'up',
      composeArgs: [],
      composeGlobalArgs: [],
      mode: 'prod',
      resetSupabase: false,
      strategy: 'blue-green',
      withSupabase: false,
    }
  );
});

test('usesBlueGreenStrategy only enables blue-green for production', () => {
  assert.equal(
    usesBlueGreenStrategy(
      parseArgs(['up', '--mode', 'prod', '--strategy', 'blue-green'])
    ),
    true
  );
  assert.equal(
    usesBlueGreenStrategy(parseArgs(['up', '--strategy', 'blue-green'])),
    false
  );
});

test('parseEnvFile ignores comments and unquotes values', () => {
  const fsStub = createFsStub({
    envFileContent: [
      '# Comment',
      'NEXT_PUBLIC_SUPABASE_URL=http://localhost:8001 # local',
      'SUPABASE_ANON_KEY="value-with-#-inside"',
      'SUPABASE_SECRET_KEY=test-secret',
    ].join('\n'),
  });

  assert.deepEqual(parseEnvFile(WEB_ENV_FILE, fsStub), {
    NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:8001',
    SUPABASE_ANON_KEY: 'value-with-#-inside',
    SUPABASE_SECRET_KEY: 'test-secret',
  });
});

test('rewriteLocalhostUrl maps local URLs to the Docker host alias', () => {
  assert.equal(
    rewriteLocalhostUrl('http://localhost:8001'),
    `http://${DOCKER_HOST_ALIAS}:8001/`
  );
  assert.equal(
    rewriteLocalhostUrl('http://[::1]:8001'),
    `http://${DOCKER_HOST_ALIAS}:8001/`
  );
  assert.equal(
    rewriteLocalhostUrl('https://127.0.0.1:9999/path'),
    `https://${DOCKER_HOST_ALIAS}:9999/path`
  );
  assert.equal(
    rewriteLocalhostUrl('https://example.supabase.co'),
    'https://example.supabase.co'
  );
});

test('getComposeEnvironment derives a server-side Supabase URL for Docker', () => {
  const fsStub = createFsStub({
    envFileContent: 'NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:8001',
  });

  const env = getComposeEnvironment({
    baseEnv: { PATH: 'test-path' },
    envFilePath: WEB_ENV_FILE,
    fsImpl: fsStub,
  });

  assert.equal(env.PATH, 'test-path');
  assert.equal(env.COMPOSE_DOCKER_CLI_BUILD, '1');
  assert.equal(
    env.DOCKER_INTERNAL_SUPABASE_URL,
    `http://${DOCKER_HOST_ALIAS}:8001/`
  );
  assert.equal(env.DOCKER_BUILDKIT, '1');
});

test('getComposeFile resolves the expected compose file for each mode', () => {
  assert.equal(getComposeFile('dev'), COMPOSE_FILE);
  assert.equal(getComposeFile('prod'), PROD_COMPOSE_FILE);
});

test('renderBlueGreenProxyConfig points traffic at the selected color', () => {
  assert.match(
    renderBlueGreenProxyConfig('green'),
    /proxy_pass http:\/\/web-green:7803;/
  );
});

test('writeBlueGreenActiveColor persists the selected color', () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'docker-web-blue-green-')
  );
  const paths = getBlueGreenPaths(tempDir);

  try {
    writeBlueGreenActiveColor('blue', paths);
    assert.equal(readBlueGreenActiveColor(paths), 'blue');
  } finally {
    clearBlueGreenRuntime(paths);
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('runDockerWebWorkflow only runs docker compose for dev:web:docker', async () => {
  const calls = [];
  const fsStub = createFsStub({
    envFileContent: 'NEXT_PUBLIC_SUPABASE_URL=http://localhost:8001',
  });
  const runCommand = async (command, args, options = {}) => {
    calls.push({
      args,
      command,
      env: options.env,
      stdio: options.stdio ?? 'inherit',
    });

    return { code: 0, signal: null, stderr: '', stdout: '' };
  };

  await runDockerWebWorkflow(parseArgs(['up']), {
    env: { PATH: 'test-path' },
    fsImpl: fsStub,
    runCommand,
  });

  assert.deepEqual(
    calls.map((call) => [call.command, call.args]),
    [
      ['docker', ['compose', 'version']],
      [
        'docker',
        ['compose', '-f', COMPOSE_FILE, 'up', '--build', '--remove-orphans'],
      ],
    ]
  );
  assert.equal(calls[0].stdio, 'ignore');
  assert.equal(
    calls[1].env.DOCKER_INTERNAL_SUPABASE_URL,
    `http://${DOCKER_HOST_ALIAS}:8001/`
  );
});

test('runDockerWebWorkflow uses the production compose file for in-place deploys', async () => {
  const calls = [];
  const fsStub = createFsStub({
    envFileContent: 'NEXT_PUBLIC_SUPABASE_URL=http://localhost:8001',
  });
  const runCommand = async (command, args, options = {}) => {
    calls.push({
      args,
      command,
      stdio: options.stdio ?? 'inherit',
    });

    if (args.includes('ps')) {
      return { code: 0, signal: null, stderr: '', stdout: '' };
    }

    return { code: 0, signal: null, stderr: '', stdout: '' };
  };

  await runDockerWebWorkflow(parseArgs(['up', '--mode', 'prod']), {
    env: { PATH: 'test-path' },
    fsImpl: fsStub,
    runCommand,
  });

  assert.deepEqual(calls.at(-1), {
    args: [
      'compose',
      '-f',
      PROD_COMPOSE_FILE,
      'up',
      '--build',
      '--remove-orphans',
      'web',
    ],
    command: 'docker',
    stdio: 'inherit',
  });
});

test('runDockerWebWorkflow starts and resets Supabase before Docker when requested', async () => {
  const calls = [];
  const fsStub = createFsStub({
    envFileContent: 'NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co',
  });
  const runCommand = async (command, args) => {
    calls.push([command, args]);
    return { code: 0, signal: null, stderr: '', stdout: '' };
  };

  await runDockerWebWorkflow(parseArgs(['up', '--reset-supabase']), {
    env: { PATH: 'test-path' },
    fsImpl: fsStub,
    runCommand,
  });

  assert.deepEqual(calls, [
    ['docker', ['compose', 'version']],
    ['bun', ['sb:start']],
    ['bun', ['sb:reset']],
    [
      'docker',
      ['compose', '-f', COMPOSE_FILE, 'up', '--build', '--remove-orphans'],
    ],
  ]);
});

test('runDockerWebWorkflow throws a clear error when apps/web/.env.local is missing', async () => {
  await assert.rejects(
    () =>
      runDockerWebWorkflow(parseArgs(['up']), {
        env: { PATH: 'test-path' },
        fsImpl: createFsStub({ hasEnvFile: false }),
        runCommand: async () => ({
          code: 0,
          signal: null,
          stderr: '',
          stdout: '',
        }),
      }),
    /Missing required env file/
  );
});

test('runDockerWebWorkflow requires SRH_TOKEN for the production redis profile', async () => {
  await assert.rejects(
    () =>
      runDockerWebWorkflow(
        parseArgs(['up', '--mode', 'prod', '--profile', 'redis']),
        {
          env: { PATH: 'test-path' },
          fsImpl: createFsStub({
            envFileContent: 'NEXT_PUBLIC_SUPABASE_URL=http://localhost:8001',
          }),
          runCommand: async () => ({
            code: 0,
            signal: null,
            stderr: '',
            stdout: '',
          }),
        }
      ),
    /SRH_TOKEN must be set/
  );
});

test('runDockerWebWorkflow performs an initial blue-green deployment', async () => {
  const calls = [];
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'docker-web-bg-initial-')
  );
  const envFilePath = path.join(tempDir, 'apps', 'web', '.env.local');

  fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
  fs.writeFileSync(
    envFilePath,
    'NEXT_PUBLIC_SUPABASE_URL=http://localhost:8001\n'
  );

  const runCommand = async (command, args) => {
    calls.push([command, args]);

    if (args.includes('ps') && args.at(-1) === 'web') {
      return { code: 0, signal: null, stderr: '', stdout: '' };
    }

    if (args.includes('ps') && args.at(-1) === 'web-blue') {
      return { code: 0, signal: null, stderr: '', stdout: 'container-blue\n' };
    }

    if (args[0] === 'inspect') {
      return { code: 0, signal: null, stderr: '', stdout: 'healthy\n' };
    }

    return { code: 0, signal: null, stderr: '', stdout: '' };
  };

  try {
    await runDockerWebWorkflow(
      parseArgs(['up', '--mode', 'prod', '--strategy', 'blue-green']),
      {
        env: { PATH: 'test-path' },
        envFilePath,
        rootDir: tempDir,
        runCommand,
      }
    );

    const paths = getBlueGreenPaths(tempDir);
    assert.equal(readBlueGreenActiveColor(paths), 'blue');
    assert.match(
      fs.readFileSync(paths.proxyConfigFile, 'utf8'),
      /proxy_pass http:\/\/web-blue:7803;/
    );
    assert.deepEqual(calls[1], [
      'docker',
      ['compose', '-f', PROD_COMPOSE_FILE, 'ps', '-q', 'web'],
    ]);
    assert.ok(
      calls.some(
        ([command, args]) =>
          command === 'docker' &&
          args[0] === 'compose' &&
          args[1] === '-f' &&
          args[2] === PROD_COMPOSE_FILE &&
          args.includes('up') &&
          args.includes(BLUE_GREEN_PROXY_SERVICE) &&
          args.includes('web-blue')
      )
    );
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('runDockerWebWorkflow switches traffic to the new color after it becomes healthy', async () => {
  const calls = [];
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'docker-web-bg-switch-')
  );
  const envFilePath = path.join(tempDir, 'apps', 'web', '.env.local');
  const paths = getBlueGreenPaths(tempDir);

  fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
  fs.writeFileSync(
    envFilePath,
    'NEXT_PUBLIC_SUPABASE_URL=http://localhost:8001\n'
  );
  writeBlueGreenActiveColor('blue', paths);

  const runCommand = async (command, args) => {
    calls.push([command, args]);

    if (args.includes('ps') && args.at(-1) === 'web') {
      return { code: 0, signal: null, stderr: '', stdout: '' };
    }

    if (args.includes('ps') && args.at(-1) === 'web-green') {
      return { code: 0, signal: null, stderr: '', stdout: 'container-green\n' };
    }

    if (args.includes('ps') && args.at(-1) === 'web-blue') {
      return { code: 0, signal: null, stderr: '', stdout: 'container-blue\n' };
    }

    if (args[0] === 'inspect') {
      return { code: 0, signal: null, stderr: '', stdout: 'healthy\n' };
    }

    return { code: 0, signal: null, stderr: '', stdout: '' };
  };

  try {
    await runDockerWebWorkflow(
      parseArgs(['up', '--mode', 'prod', '--strategy', 'blue-green']),
      {
        env: { PATH: 'test-path' },
        envFilePath,
        rootDir: tempDir,
        runCommand,
      }
    );

    assert.equal(readBlueGreenActiveColor(paths), 'green');
    assert.match(
      fs.readFileSync(paths.proxyConfigFile, 'utf8'),
      /proxy_pass http:\/\/web-green:7803;/
    );
    assert.ok(
      calls.some(
        ([command, args]) =>
          command === 'docker' &&
          args.includes('exec') &&
          args.includes(BLUE_GREEN_PROXY_SERVICE) &&
          args.includes('reload')
      )
    );
    assert.ok(
      calls.some(
        ([command, args]) =>
          command === 'docker' &&
          args.includes('stop') &&
          args.includes('web-blue')
      )
    );
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});

test('runDockerWebWorkflow ignores stale active colors without live containers', async () => {
  const calls = [];
  let webBluePsCalls = 0;
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'docker-web-bg-stale-')
  );
  const envFilePath = path.join(tempDir, 'apps', 'web', '.env.local');
  const paths = getBlueGreenPaths(tempDir);

  fs.mkdirSync(path.dirname(envFilePath), { recursive: true });
  fs.writeFileSync(
    envFilePath,
    'NEXT_PUBLIC_SUPABASE_URL=http://localhost:8001\n'
  );
  writeBlueGreenActiveColor('blue', paths);

  const runCommand = async (command, args) => {
    calls.push([command, args]);

    if (args.includes('ps') && args.at(-1) === 'web') {
      return { code: 0, signal: null, stderr: '', stdout: '' };
    }

    if (args.includes('ps') && args.at(-1) === 'web-blue') {
      webBluePsCalls += 1;
      return {
        code: 0,
        signal: null,
        stderr: '',
        stdout: webBluePsCalls === 1 ? '' : 'container-blue\n',
      };
    }

    if (args[0] === 'inspect') {
      return { code: 0, signal: null, stderr: '', stdout: 'healthy\n' };
    }

    return { code: 0, signal: null, stderr: '', stdout: '' };
  };

  try {
    await runDockerWebWorkflow(
      parseArgs(['up', '--mode', 'prod', '--strategy', 'blue-green']),
      {
        env: { PATH: 'test-path' },
        envFilePath,
        rootDir: tempDir,
        runCommand,
      }
    );

    assert.equal(readBlueGreenActiveColor(paths), 'blue');
    assert.ok(
      calls.some(
        ([command, args]) =>
          command === 'docker' &&
          args[0] === 'compose' &&
          args[1] === '-f' &&
          args[2] === PROD_COMPOSE_FILE &&
          args.includes('up') &&
          args.includes(BLUE_GREEN_PROXY_SERVICE) &&
          args.includes('web-blue')
      )
    );
    assert.ok(
      !calls.some(
        ([command, args]) =>
          command === 'docker' &&
          args.includes('exec') &&
          args.includes(BLUE_GREEN_PROXY_SERVICE) &&
          args.includes('reload')
      )
    );
  } finally {
    fs.rmSync(tempDir, { force: true, recursive: true });
  }
});
