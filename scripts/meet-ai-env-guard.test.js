const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const FORBIDDEN = 'process.env.MEET_AI_ENABLED_WORKSPACE_IDS';
const SCAN_ROOTS = ['packages/realtime/src/meet', 'packages/meet-core'];

function scanFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(directory, entry.name);
    return entry.isDirectory()
      ? scanFiles(filePath)
      : entry.isFile()
        ? [filePath]
        : [];
  });
}

test('meet code does not read MEET_AI_ENABLED_WORKSPACE_IDS', () => {
  const matches = SCAN_ROOTS.flatMap((root) => scanFiles(path.join(ROOT, root)))
    .filter((filePath) => fs.readFileSync(filePath, 'utf8').includes(FORBIDDEN))
    .map((filePath) => path.relative(ROOT, filePath));
  assert.deepEqual(
    matches,
    [],
    `Forbidden environment read found in: ${matches.join(', ')}`
  );
});
