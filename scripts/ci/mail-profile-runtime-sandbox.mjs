import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const CHROME_SANDBOX = '/opt/google/chrome/chrome-sandbox';
const PARENTS = ['/', '/opt', '/opt/google', '/opt/google/chrome'];

export function assertSandboxMetadata(helper, parents, environment) {
  assert.equal(
    environment,
    CHROME_SANDBOX,
    'Unexpected sandbox helper selection'
  );
  assert.equal(helper.isFile, true, 'Sandbox helper must be a regular file');
  assert.equal(helper.uid, 0, 'Sandbox helper must be root-owned');
  assert.equal(helper.gid, 0, 'Sandbox helper must be root-group-owned');
  assert.equal(
    helper.mode & 0o7777,
    0o4755,
    'Sandbox helper must have mode 4755'
  );
  assert.equal(
    parents.length,
    PARENTS.length,
    'Incomplete sandbox parent proof'
  );
  for (const parent of parents) {
    assert.equal(
      parent.isDirectory,
      true,
      'Sandbox parent must be a real directory'
    );
    assert.equal(parent.uid, 0, 'Sandbox parent must be root-owned');
    assert.equal(
      parent.mode & 0o022,
      0,
      'Sandbox parent must not be writable by others'
    );
  }
}

export async function verifySandboxHelper(environment) {
  const metadata = async (target) => {
    const stat = await fs.lstat(target);
    return {
      isFile: stat.isFile(),
      isDirectory: stat.isDirectory(),
      uid: stat.uid,
      gid: stat.gid,
      mode: stat.mode,
    };
  };
  const helper = await metadata(CHROME_SANDBOX);
  const parents = await Promise.all(PARENTS.map(metadata));
  assertSandboxMetadata(helper, parents, environment);
  await fs.access(CHROME_SANDBOX, fs.constants.X_OK);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await verifySandboxHelper(process.argv[2]);
}
