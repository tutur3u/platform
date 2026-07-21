const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  preparePackageManifest,
  resolveWorkspaceDependencyVersion,
} = require('./prepare-npm-package-manifest.js');

function writeJson(rootDir, filePath, value) {
  const absolutePath = path.join(rootDir, filePath);

  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `${JSON.stringify(value, null, 2)}\n`);
}

function readJson(rootDir, filePath) {
  return JSON.parse(fs.readFileSync(path.join(rootDir, filePath), 'utf8'));
}

function createFixture() {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'npm-manifest-'));

  writeJson(repoRoot, 'package.json', {
    private: true,
    workspaces: ['packages/*'],
  });
  writeJson(repoRoot, 'packages/api/package.json', {
    dependencies: {
      '@tuturuuu/types': 'workspace:*',
      zod: '^4.0.0',
    },
    devDependencies: {
      '@tuturuuu/typescript-config': 'workspace:^',
    },
    name: '@tuturuuu/api',
    optionalDependencies: {
      '@tuturuuu/devbox': 'workspace:~',
    },
    peerDependencies: {
      '@tuturuuu/ui': 'workspace:^1.2.3',
    },
    version: '0.5.0',
  });

  for (const [packageName, version] of [
    ['@tuturuuu/devbox', '0.1.0'],
    ['@tuturuuu/types', '0.3.0'],
    ['@tuturuuu/typescript-config', '0.2.0'],
    ['@tuturuuu/ui', '1.2.3'],
  ]) {
    writeJson(
      repoRoot,
      `packages/${packageName.replace('@tuturuuu/', '')}/package.json`,
      {
        name: packageName,
        version,
      }
    );
  }

  return repoRoot;
}

test('workspace dependency versions resolve to npm-compatible ranges', () => {
  assert.equal(
    resolveWorkspaceDependencyVersion('workspace:*', '1.2.3'),
    '1.2.3'
  );
  assert.equal(
    resolveWorkspaceDependencyVersion('workspace:^', '1.2.3'),
    '^1.2.3'
  );
  assert.equal(
    resolveWorkspaceDependencyVersion('workspace:~', '1.2.3'),
    '~1.2.3'
  );
  assert.equal(
    resolveWorkspaceDependencyVersion('workspace:^1.2.0', '1.2.3'),
    '^1.2.0'
  );
});

test('preparePackageManifest rewrites workspace protocol dependencies', () => {
  const repoRoot = createFixture();
  const result = preparePackageManifest({
    packageDir: 'packages/api',
    repoRoot,
  });
  const packageJson = readJson(repoRoot, 'packages/api/package.json');

  assert.deepEqual(
    result.rewrites.map((rewrite) => [
      rewrite.field,
      rewrite.name,
      rewrite.from,
      rewrite.to,
    ]),
    [
      ['dependencies', '@tuturuuu/types', 'workspace:*', '0.3.0'],
      [
        'devDependencies',
        '@tuturuuu/typescript-config',
        'workspace:^',
        '^0.2.0',
      ],
      ['optionalDependencies', '@tuturuuu/devbox', 'workspace:~', '~0.1.0'],
      ['peerDependencies', '@tuturuuu/ui', 'workspace:^1.2.3', '^1.2.3'],
    ]
  );
  assert.equal(packageJson.dependencies['@tuturuuu/types'], '0.3.0');
  assert.equal(
    packageJson.devDependencies['@tuturuuu/typescript-config'],
    '^0.2.0'
  );
  assert.equal(packageJson.optionalDependencies['@tuturuuu/devbox'], '~0.1.0');
  assert.equal(packageJson.peerDependencies['@tuturuuu/ui'], '^1.2.3');
  assert.equal(packageJson.dependencies.zod, '^4.0.0');
});

test('preparePackageManifest embeds UI vendored xlsx for portable npm installs', () => {
  const repoRoot = createFixture();

  writeJson(repoRoot, 'packages/ui/package.json', {
    dependencies: {
      xlsx: 'file:vendor/xlsx-0.20.3.tgz',
    },
    exports: {
      './xlsx': './src/xlsx.ts',
    },
    name: '@tuturuuu/ui',
    version: '1.2.3',
  });
  fs.mkdirSync(path.join(repoRoot, 'packages/ui/vendor'), { recursive: true });
  fs.writeFileSync(
    path.join(repoRoot, 'packages/ui/vendor/xlsx-0.20.3.tgz'),
    'fixture'
  );

  const extractions = [];

  const result = preparePackageManifest({
    extractTarball: ({ archivePath, destinationPath, members }) => {
      extractions.push({ archivePath, destinationPath, members });
      for (const relativePath of [
        'LICENSE',
        'types/index.d.ts',
        'xlsx.js',
        'xlsx.mjs',
      ]) {
        const filePath = path.join(destinationPath, relativePath);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, 'fixture');
      }
    },
    packageDir: 'packages/ui',
    repoRoot,
  });
  const packageJson = readJson(repoRoot, 'packages/ui/package.json');

  assert.deepEqual(
    result.rewrites.map((rewrite) => [
      rewrite.field,
      rewrite.name,
      rewrite.from,
      rewrite.to,
    ]),
    [
      [
        'dependencies',
        'xlsx',
        'file:vendor/xlsx-0.20.3.tgz',
        'embedded:vendor/xlsx',
      ],
    ]
  );
  assert.deepEqual(extractions, [
    {
      archivePath: path.join(repoRoot, 'packages/ui/vendor/xlsx-0.20.3.tgz'),
      destinationPath: path.join(repoRoot, 'packages/ui/vendor/xlsx'),
      members: [
        'package/LICENSE',
        'package/types/index.d.ts',
        'package/xlsx.js',
        'package/xlsx.mjs',
      ],
    },
  ]);
  assert.equal(
    fs.existsSync(path.join(repoRoot, 'packages/ui/vendor/xlsx-0.20.3.tgz')),
    false
  );
  assert.equal(packageJson.dependencies.xlsx, undefined);
  assert.deepEqual(packageJson.exports['./xlsx'], {
    types: './vendor/xlsx/types/index.d.ts',
    import: './vendor/xlsx/xlsx.mjs',
    require: './vendor/xlsx/xlsx.js',
    default: './vendor/xlsx/xlsx.js',
  });
});

test('preparePackageManifest rejects unhandled file dependencies', () => {
  const repoRoot = createFixture();
  const packageJson = readJson(repoRoot, 'packages/api/package.json');

  packageJson.dependencies.fixture = 'file:vendor/fixture.tgz';
  writeJson(repoRoot, 'packages/api/package.json', packageJson);

  assert.throws(
    () => preparePackageManifest({ packageDir: 'packages/api', repoRoot }),
    /cannot publish dependencies\.fixture as file:vendor\/fixture\.tgz/
  );
});

test('preparePackageManifest rejects unknown workspace protocol dependencies', () => {
  const repoRoot = createFixture();
  const packageJson = readJson(repoRoot, 'packages/api/package.json');

  packageJson.dependencies['@tuturuuu/missing'] = 'workspace:*';
  writeJson(repoRoot, 'packages/api/package.json', packageJson);

  assert.throws(
    () => preparePackageManifest({ packageDir: 'packages/api', repoRoot }),
    /no matching workspace package exists/
  );
});
