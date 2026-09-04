const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  checkPackageExports,
  checkWorkspacePackageExports,
  collectExportTargets,
  formatPackageExportViolation,
} = require('./check-package-exports.js');

const temporaryDirectories = [];

function createFixturePackage(manifest, files = []) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'package-exports-'));
  temporaryDirectories.push(rootDir);
  const packageDir = path.join(rootDir, 'packages', 'fixture');
  fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(
    path.join(packageDir, 'package.json'),
    `${JSON.stringify(manifest, null, 2)}\n`
  );
  for (const file of files) {
    const filePath = path.join(packageDir, file);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, 'export {};\n');
  }
  return { manifestPath: path.join(packageDir, 'package.json'), rootDir };
}

test.afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { force: true, recursive: true });
  }
});

test('collectExportTargets reads literal, wildcard, and conditional targets', () => {
  assert.deepEqual(
    collectExportTargets({
      '.': {
        import: './src/index.js',
        types: './src/index.d.ts',
      },
      './features/*': './src/features/*.js',
    }),
    [
      { exportKey: '.', target: './src/index.js' },
      { exportKey: '.', target: './src/index.d.ts' },
      { exportKey: './features/*', target: './src/features/*.js' },
    ]
  );
});

test('checkPackageExports accepts files, wildcard bases, and conditionals', () => {
  const { manifestPath } = createFixturePackage(
    {
      exports: {
        '.': {
          import: './src/index.js',
          types: './src/index.d.ts',
        },
        './features/*': './src/features/*.js',
      },
      name: '@fixture/valid',
      version: '1.0.0',
    },
    ['src/index.js', 'src/index.d.ts', 'src/features/example.js']
  );

  assert.deepEqual(checkPackageExports(manifestPath), []);
});

test('checkPackageExports reports missing literal and wildcard targets', () => {
  const { manifestPath } = createFixturePackage({
    exports: {
      './missing': './src/missing.js',
      './missing/*': './src/missing/*.js',
    },
    name: '@fixture/broken',
    version: '1.0.0',
  });

  const violations = checkPackageExports(manifestPath);
  assert.deepEqual(violations, [
    {
      exportKey: './missing',
      packageName: '@fixture/broken',
      target: './src/missing.js',
      type: 'missing-target',
    },
    {
      exportKey: './missing/*',
      packageName: '@fixture/broken',
      target: './src/missing/*.js',
      type: 'missing-wildcard-base',
    },
  ]);
  assert.match(
    formatPackageExportViolation(violations[1]),
    /@fixture\/broken export "\.\/missing\/\*".*wildcard base directory is missing/u
  );
});

test('workspace validation ignores unversioned packages', () => {
  const { rootDir } = createFixturePackage({
    exports: { '.': './src/missing.js' },
    name: '@fixture/unversioned',
  });

  assert.deepEqual(checkWorkspacePackageExports(rootDir), []);
});

test('repository workspace package exports resolve', () => {
  assert.deepEqual(
    checkWorkspacePackageExports(path.resolve(__dirname, '..')),
    []
  );
});
