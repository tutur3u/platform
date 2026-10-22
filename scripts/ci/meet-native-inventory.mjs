import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative } from 'node:path';

const hiddenEntries = new Map([
  ['client/.assetsignore', 'file'],
  ['server/.vite', 'directory'],
  ['server/.vite/manifest.json', 'file'],
  ['server/.dev.vars', 'file'],
]);
const fixtureDevVars =
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='sb_publishable_meet_ci_placeholder'\nNEXT_PUBLIC_SUPABASE_URL='https://meet-ci.supabase.invalid'\n";
const assetsIgnore = 'wrangler.json\n.dev.vars\n';
const metadataFields = new Set([
  'file',
  'name',
  'src',
  'isEntry',
  'isDynamicEntry',
  'imports',
  'dynamicImports',
  'css',
  'assets',
]);
const credentialName =
  /^(?:\.env(?:\..*)?|\.dev\.vars(?:\..*)?|\.npmrc|\.netrc|credentials(?:\.json)?|id_rsa|id_ed25519)$/i;

function text(value) {
  assert.ok(
    typeof value === 'string' && value.length > 0 && value.length <= 8192,
    'Invalid Vite metadata string'
  );
}
function outputPath(value, files) {
  text(value);
  assert.ok(
    !isAbsolute(value) &&
      !value.includes('\\') &&
      !value.includes('\0') &&
      value.split('/').every((part) => part && part !== '.' && part !== '..'),
    'Vite output path escape'
  );
  assert.equal(
    typeof files[`server/${value}`],
    'string',
    'Vite metadata output must be sealed'
  );
}
function validateVite(bytes, files) {
  assert.ok(bytes.length <= 4 * 1024 * 1024, 'Vite metadata size bound');
  let metadata;
  try {
    metadata = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Error('Invalid Vite metadata JSON');
  }
  assert.ok(
    metadata && Object.getPrototypeOf(metadata) === Object.prototype,
    'Vite metadata object required'
  );
  const entries = Object.entries(metadata);
  assert.ok(
    entries.length > 0 && entries.length <= 20000,
    'Vite metadata entry bound'
  );
  for (const [key, entry] of entries) {
    text(key);
    assert.ok(
      entry && Object.getPrototypeOf(entry) === Object.prototype,
      'Vite entry object required'
    );
    assert.ok(
      Object.keys(entry).every((field) => metadataFields.has(field)),
      'Unsupported Vite metadata field'
    );
    outputPath(entry.file, files);
    // Source IDs are sealed provenance, never file-discovery or import authority.
    for (const field of ['name', 'src'])
      if (Object.hasOwn(entry, field)) text(entry[field]);
    for (const field of ['isEntry', 'isDynamicEntry'])
      if (Object.hasOwn(entry, field))
        assert.equal(typeof entry[field], 'boolean', 'Vite boolean required');
    for (const field of ['imports', 'dynamicImports', 'css', 'assets']) {
      if (!Object.hasOwn(entry, field)) continue;
      assert.ok(
        Array.isArray(entry[field]) && entry[field].length <= 20000,
        'Vite reference array required'
      );
      for (const value of entry[field]) {
        if (field === 'css' || field === 'assets') outputPath(value, files);
        else {
          text(value);
          assert.ok(
            Object.hasOwn(metadata, value),
            'Unsealed Vite import reference'
          );
        }
      }
    }
  }
}

// Meet's observed emitted files remain part of the ordinary byte/directory seal.
// This does not relax the shared single-artifact helper or discover dotenv files.
export async function sealMeetApp(
  root,
  { configRelative, assetsRelative, allowSdkWorkingDir = false }
) {
  assert.equal(
    await realpath(root),
    root,
    'Meet artifact root must be canonical'
  );
  const files = {},
    hiddenBytes = new Map();
  let hiddenSeen = false;
  const sdk = join(dirname(configRelative), '.wrangler');
  async function visit(directory) {
    assert.equal(await realpath(directory), directory);
    for (const entry of (
      await readdir(directory, { withFileTypes: true })
    ).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(directory, entry.name),
        name = relative(root, path);
      if (allowSdkWorkingDir && name === sdk) continue;
      assert.ok(
        entry.isDirectory() || entry.isFile(),
        'Meet artifact links/special files forbidden'
      );
      assert.equal(
        await realpath(path),
        path,
        'Meet artifact symlink forbidden'
      );
      if (
        entry.name.startsWith('.') ||
        name.split('/').some((part) => part.startsWith('.'))
      ) {
        hiddenSeen = true;
        assert.equal(
          hiddenEntries.get(name),
          entry.isDirectory() ? 'directory' : 'file',
          'Unsupported Meet hidden artifact entry'
        );
        assert.equal(
          configRelative,
          'server/wrangler.json',
          'Hidden layout requires emitted server config'
        );
        assert.equal(
          assetsRelative,
          'client',
          'Hidden layout requires emitted client assets'
        );
      }
      assert.ok(
        !credentialName.test(entry.name) || name === 'server/.dev.vars',
        'Meet credential artifact forbidden'
      );
      if (entry.isDirectory()) {
        files[`${name}/`] = null;
        await visit(path);
      } else {
        const bytes = await readFile(path);
        files[name] = createHash('sha256').update(bytes).digest('hex');
        if (hiddenEntries.has(name)) hiddenBytes.set(name, bytes);
      }
    }
  }
  await visit(root);
  if (hiddenSeen || configRelative === 'server/wrangler.json') {
    assert.equal(hiddenBytes.size, 3, 'Incomplete Meet emitted hidden layout');
    assert.equal(
      hiddenBytes
        .get('client/.assetsignore')
        ?.equals(Buffer.from(assetsIgnore)),
      true,
      'Unexpected asset ignore content'
    );
    assert.equal(
      hiddenBytes.get('server/.dev.vars')?.equals(Buffer.from(fixtureDevVars)),
      true,
      'Only exact public CI fixture dev vars admitted'
    );
    validateVite(hiddenBytes.get('server/.vite/manifest.json'), files);
  }
  return files;
}
