const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  VAULT_RELATIVE_PATH,
  findViolations,
} = require('./check-multi-account-vault-owner.js');

function createTempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'multi-account-vault-owner-'));
}

function writeVault(root, appName) {
  const directory = path.join(root, 'apps', appName, VAULT_RELATIVE_PATH);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(
    path.join(directory, 'vault.ts'),
    'export async function switchWebAccount() {}\n'
  );
}

test('accepts the vault in its owning app', () => {
  const root = createTempRepo();
  writeVault(root, 'web');

  assert.deepEqual(findViolations(root), []);
});

test('flags a copy in another app', () => {
  const root = createTempRepo();
  writeVault(root, 'web');
  writeVault(root, 'infrastructure');

  assert.deepEqual(findViolations(root), [
    path.join('apps', 'infrastructure', VAULT_RELATIVE_PATH),
  ]);
});

test('reports every copy, sorted', () => {
  const root = createTempRepo();
  writeVault(root, 'tasks');
  writeVault(root, 'infrastructure');

  assert.deepEqual(findViolations(root), [
    path.join('apps', 'infrastructure', VAULT_RELATIVE_PATH),
    path.join('apps', 'tasks', VAULT_RELATIVE_PATH),
  ]);
});

test('tolerates a repo without an apps directory', () => {
  assert.deepEqual(findViolations(createTempRepo()), []);
});

test('the repository itself satisfies the rule', () => {
  assert.deepEqual(findViolations(), []);
});
