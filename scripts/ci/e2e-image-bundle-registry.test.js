const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createBakeMetadataRunner } = require('./e2e-image-bundle-registry.js');

test('registry Bake grants read access only to configured absolute Turbo secret files', async () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'e2e-bake-entitlements-')
  );
  const teamFile = path.join(directory, 'turbo-team');
  const tokenFile = path.join(directory, 'turbo-token');
  const calls = [];

  try {
    const metadata = createBakeMetadataRunner({
      directory,
      run: async (command, args, options) =>
        calls.push([command, args, options]),
      services: ['hive-blue'],
    });
    const env = {
      DOCKER_WEB_TURBO_TEAM_SECRET_FILE: teamFile,
      DOCKER_WEB_TURBO_TOKEN_SECRET_FILE: tokenFile,
    };

    await metadata.run(
      'docker',
      [
        'buildx',
        'bake',
        '--builder',
        'ci-builder',
        '-f',
        'docker-compose.web.prod.yml',
        'hive-blue',
      ],
      { env }
    );

    assert.deepEqual(calls, [
      [
        'docker',
        [
          'buildx',
          'bake',
          `--allow=fs.read=${teamFile}`,
          `--allow=fs.read=${tokenFile}`,
          '--builder',
          'ci-builder',
          '-f',
          'docker-compose.web.prod.yml',
          '--metadata-file',
          metadata.metadataFiles.get('hive-blue'),
          'hive-blue',
        ],
        { env },
      ],
    ]);
  } finally {
    fs.rmSync(directory, { force: true, recursive: true });
  }
});

test('registry Bake keeps repository-relative secret placeholders entitlement-free', async () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'e2e-bake-entitlements-')
  );
  const calls = [];

  try {
    const metadata = createBakeMetadataRunner({
      directory,
      run: async (_command, args) => calls.push(args),
      services: ['backend'],
    });

    await metadata.run(
      'docker',
      ['buildx', 'bake', '-f', 'docker-compose.web.prod.yml', 'backend'],
      {
        env: {
          DOCKER_WEB_TURBO_TEAM_SECRET_FILE: 'docker-compose/empty-secret',
          DOCKER_WEB_TURBO_TOKEN_SECRET_FILE: 'docker-compose/empty-secret',
        },
      }
    );

    assert.equal(
      calls[0].some((arg) => arg.startsWith('--allow=')),
      false
    );
  } finally {
    fs.rmSync(directory, { force: true, recursive: true });
  }
});

test('registry Bake deduplicates matching absolute Turbo secret paths', async () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'e2e-bake-entitlements-')
  );
  const calls = [];

  try {
    const metadata = createBakeMetadataRunner({
      directory,
      run: async (_command, args) => calls.push(args),
      services: ['backend'],
    });
    const sharedFile = path.join(directory, 'turbo-secret');

    await metadata.run('docker', ['buildx', 'bake', 'backend'], {
      env: {
        DOCKER_WEB_TURBO_TEAM_SECRET_FILE: sharedFile,
        DOCKER_WEB_TURBO_TOKEN_SECRET_FILE: sharedFile,
      },
    });

    assert.deepEqual(
      calls[0].filter((arg) => arg.startsWith('--allow=')),
      [`--allow=fs.read=${sharedFile}`]
    );
  } finally {
    fs.rmSync(directory, { force: true, recursive: true });
  }
});

test('registry Bake rejects control characters in secret file paths', async () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'e2e-bake-entitlements-')
  );

  try {
    const metadata = createBakeMetadataRunner({
      directory,
      run: async () => {},
      services: ['backend'],
    });

    await assert.rejects(
      () =>
        metadata.run('docker', ['buildx', 'bake', 'backend'], {
          env: {
            DOCKER_WEB_TURBO_TOKEN_SECRET_FILE: '/tmp/turbo-token\n--push',
          },
        }),
      /invalid control characters/u
    );
  } finally {
    fs.rmSync(directory, { force: true, recursive: true });
  }
});
