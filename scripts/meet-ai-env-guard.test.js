const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

// The Meet AI workspace allowlist is a Worker binding (env.MEET_AI_ENABLED_WORKSPACE_IDS).
// Meet code must never fall back to process.env for it.
const ROOT = path.resolve(__dirname, '..');
const SCAN_ROOTS = ['packages/realtime/src/meet', 'packages/meet-core/src'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.turbo', 'coverage']);
const NAME = 'MEET_AI_ENABLED_WORKSPACE_IDS';
const FORBIDDEN = [
  // process.env.NAME, process.env?.NAME, process.env['NAME']
  new RegExp(
    `process\\.env\\s*(?:\\??\\.\\s*${NAME}\\b|(?:\\?\\.)?\\s*\\[\\s*['"\`]${NAME}['"\`]\\s*\\])`
  ),
  // const { NAME } = process.env
  new RegExp(`\\{[^}]*\\b${NAME}\\b[^}]*\\}\\s*=\\s*process\\.env\\b`),
];

function scanFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return SKIP_DIRS.has(entry.name) ? [] : scanFiles(filePath);
    }
    return entry.isFile() && /\.[cm]?[jt]sx?$/.test(entry.name)
      ? [filePath]
      : [];
  });
}

test('meet scan roots exist so the guard cannot pass vacuously', () => {
  for (const root of SCAN_ROOTS) {
    assert.ok(
      fs.existsSync(path.join(ROOT, root)),
      `missing scan root ${root}`
    );
  }
});

test('meet code does not read MEET_AI_ENABLED_WORKSPACE_IDS from process.env', () => {
  const matches = SCAN_ROOTS.flatMap((root) => scanFiles(path.join(ROOT, root)))
    .filter((filePath) => {
      const source = fs.readFileSync(filePath, 'utf8');
      return FORBIDDEN.some((pattern) => pattern.test(source));
    })
    .map((filePath) => path.relative(ROOT, filePath));
  assert.deepEqual(
    matches,
    [],
    `Forbidden process.env read in: ${matches.join(', ')}`
  );
});

test('the forbidden patterns catch every access form', () => {
  const samples = [
    `process.env.${NAME}`,
    `process.env?.${NAME}`,
    `process.env['${NAME}']`,
    `process.env["${NAME}"]`,
    `const { ${NAME} } = process.env`,
  ];
  for (const sample of samples) {
    assert.ok(
      FORBIDDEN.some((pattern) => pattern.test(sample)),
      sample
    );
  }
  assert.ok(!FORBIDDEN.some((pattern) => pattern.test(`env.${NAME}`)));
});
