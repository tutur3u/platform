// Home labels say "Home" (vi: "Trang chủ"), never a brand-prefixed variant
// such as "Tuturuuu home" or "Quay về Tuturuuu". Genuine brand mentions that
// are not a home label ("Learn more about Tuturuuu", "tuturuuu.com") pass.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');

const BRANDED_HOME_LABELS = [
  /\btuturuuu(?:'s)? home(?:page)?\b/i,
  /\bhome(?:page)? of tuturuuu\b/i,
  /\b(?:return|back|go|head)(?: back)? to (?:your )?tuturuuu\b(?!\.\w)/i,
  /trang chủ(?: của)? tuturuuu\b/i,
  /(?:quay|trở) (?:lại|về) (?:với )?tuturuuu\b(?!\.\w)/i,
];

const SOURCE_EXTENSIONS = new Set(['.json', '.ts', '.tsx']);
const SKIPPED_DIRECTORIES = new Set([
  '.next',
  '.turbo',
  'coverage',
  'dist',
  'node_modules',
]);
// Inactive runtimes are not maintained; see apps/docs/build/devops/active-runtime.mdx.
const SKIPPED_APPS = new Set(['backend', 'docs', 'tanstack-web']);

function walk(directory, files = []) {
  if (!fs.existsSync(directory)) return files;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) files.push(full);
  }
  return files;
}

function scannedFiles() {
  const files = [];
  for (const app of fs.readdirSync(path.join(repoRoot, 'apps'))) {
    if (SKIPPED_APPS.has(app)) continue;
    walk(path.join(repoRoot, 'apps', app, 'messages'), files);
    walk(path.join(repoRoot, 'apps', app, 'src'), files);
  }
  for (const pkg of fs.readdirSync(path.join(repoRoot, 'packages'))) {
    walk(path.join(repoRoot, 'packages', pkg, 'src'), files);
  }
  return files.filter((file) => {
    if (path.extname(file) !== '.json') return true;
    return file.split(path.sep).includes('messages');
  });
}

function findBrandedHomeLabels(text) {
  return BRANDED_HOME_LABELS.filter((pattern) => pattern.test(text));
}

test('the patterns flag brand-prefixed home labels and allow brand mentions', () => {
  for (const label of [
    'Tuturuuu home',
    'Tuturuuu Home',
    'Return to your Tuturuuu home',
    'Return to Tuturuuu',
    'Back to Tuturuuu',
    'Trang chủ Tuturuuu',
    'Quay về Tuturuuu',
    'Quay lại trang chủ Tuturuuu',
  ]) {
    assert.notEqual(findBrandedHomeLabels(label).length, 0, label);
  }
  for (const text of [
    'Home',
    'Trang chủ',
    'Return to Home',
    'Learn more about Tuturuuu and our mission.',
    'Tìm hiểu thêm về Tuturuuu và sứ mệnh của chúng tôi.',
    'Chào mừng đến Tuturuuu',
    'Go to tuturuuu.com',
    'Chuyển ứng dụng về tuturuuu.com',
  ]) {
    assert.deepEqual(findBrandedHomeLabels(text), [], text);
  }
});

test('no app or package labels the home destination with the brand name', () => {
  const offenders = [];
  for (const file of scannedFiles()) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, index) => {
      if (findBrandedHomeLabels(line).length > 0) {
        offenders.push(
          `${path.relative(repoRoot, file)}:${index + 1}: ${line.trim()}`
        );
      }
    });
  }
  assert.deepEqual(
    offenders,
    [],
    'Use "Home" (vi: "Trang chủ") for home labels, without the brand name.'
  );
});
