const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { repoRoot } = require('./workflow-config-test-helpers.js');

const workerApps = [
  'ai',
  'apps',
  'chat',
  'cms',
  'contacts',
  'drive',
  'finance',
  'forms',
  'git',
  'inventory',
  'learn',
  'mail',
  'marketing',
  'meet',
  'mind',
  'nova',
  'rewise',
  'shortener',
  'storefront',
  'tasks',
  'teach',
  'tools',
  'track',
  'workspace',
];

test('Worker apps keep committed build inputs and retire Git deploy configs', () => {
  const root = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json')));
  assert.match(root.packageManager, /^bun@/);
  assert.ok(fs.existsSync(path.join(repoRoot, 'bun.lock')));
  for (const app of workerApps) {
    const directory = path.join(repoRoot, 'apps', app);
    const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'package.json')));
    assert.match(manifest.name, /^@tuturuuu\//);
    assert.ok(manifest.scripts.build, `${app} must declare its build command`);
    assert.ok(fs.existsSync(path.join(directory, 'void.config.ts')));
    assert.ok(!fs.existsSync(path.join(directory, 'vercel.json')));
  }
});
