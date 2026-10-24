import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRegularFileSync, writeExclusiveFileSync } from '../safe-fs.js';
import { sealCalendarArtifact } from './calendar-native-inventory.mjs';
import { assertMailNodeImports } from './mail-node-imports.mjs';
import { profileFor, publicationConfig } from './wave1-native-profile.mjs';

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = (path) => JSON.parse(readFileSync(path, 'utf8'));
function contained(root, target) {
  const rel = relative(root, target);
  assert.ok(
    rel && !rel.startsWith('..') && !isAbsolute(rel),
    'Artifact path escapes dist'
  );
  assert.equal(realpathSync(target), target, 'Artifact symlink forbidden');
  return target;
}
export function inventory(root) {
  sealCalendarArtifact(root);
  const files = {};
  let bytes = 0;
  let count = 0;
  function visit(path) {
    const stat = lstatSync(path);
    assert.ok(!stat.isSymbolicLink(), 'Artifact symlink forbidden');
    const name = relative(root, path).split('\\').join('/');
    assert.ok(
      !/(^|\/)(?:\.env|\.dev\.vars|node_modules|\.next|\.open-next)(?:\.|\/|$)/.test(
        name
      ),
      'Private or legacy file forbidden'
    );
    if (stat.isDirectory()) {
      for (const entry of readdirSync(path).sort()) visit(resolve(path, entry));
    } else {
      assert.ok(stat.isFile(), 'Nonregular artifact file');
      assert.ok(++count <= 50000, 'Artifact budget exceeded');
      const data = readRegularFileSync(path, { maxBytes: 1024 ** 3 - bytes });
      bytes += data.length;
      files[name] = digest(data);
    }
  }
  visit(root);
  return files;
}
export function publicInputsDigest(env) {
  return digest(
    JSON.stringify([
      env.NEXT_PUBLIC_SUPABASE_URL ?? '',
      env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '',
    ])
  );
}
export function artifactDigest(receipt) {
  return digest(JSON.stringify(receipt));
}
export function prepare(appRoot, app, environment, subdomain, sha) {
  assert.match(sha ?? '', /^[a-f0-9]{40}$/);
  appRoot = realpathSync(appRoot);
  const dist = resolve(appRoot, 'dist');
  const pointers = [
    '.wrangler/deploy/config.json',
    '.void/preview-deploy-config.json',
  ]
    .map((p) => resolve(appRoot, p))
    .filter(existsSync);
  assert.equal(
    pointers.length,
    1,
    'Exactly one Void deployment pointer required'
  );
  assert.equal(realpathSync(pointers[0]), pointers[0]);
  const pointer = json(pointers[0]);
  assert.deepEqual(pointer.auxiliaryWorkers, [], 'Auxiliary Workers forbidden');
  const emitted = contained(
    dist,
    resolve(appRoot, '.wrangler/deploy', pointer.configPath)
  );
  const base = json(emitted);
  const main = contained(dist, resolve(dirname(emitted), base.main));
  const assets = contained(
    dist,
    resolve(dirname(emitted), base.assets.directory)
  );
  assert.equal(assets, resolve(dist, 'client'));
  assertMailNodeImports(dist, app, Object.keys(inventory(dist)));
  const profile = profileFor(app, environment, subdomain);
  const config = resolve(dist, 'wave1/wrangler.json');
  assert.ok(!existsSync(config), 'Publication profile already exists');
  mkdirSync(dirname(config), { recursive: true });
  const declared = publicationConfig(base, profile, {
    main: relative(dirname(config), main),
    assets: relative(dirname(config), assets),
  });
  writeExclusiveFileSync(config, `${JSON.stringify(declared, null, 2)}\n`);
  const receipt = {
    schema: 1,
    sha,
    profile,
    emitted: relative(dist, emitted),
    lockSha256: digest(
      readFileSync(new URL('../../bun.lock', import.meta.url))
    ),
    policySha256: digest(
      readFileSync(new URL('./wave1-native-profiles.json', import.meta.url))
    ),
    publicInputsSha256: publicInputsDigest(process.env),
    files: inventory(dist),
  };
  writeFileSync(
    resolve(appRoot, 'wave1-artifact.json'),
    `${JSON.stringify(receipt, null, 2)}\n`
  );
  return receipt;
}
export function verify(appRoot, app, environment, sha) {
  appRoot = realpathSync(appRoot);
  const receipt = json(resolve(appRoot, 'wave1-artifact.json'));
  assert.equal(receipt.schema, 1);
  assert.match(sha ?? '', /^[a-f0-9]{40}$/);
  assert.equal(receipt.sha, sha);
  assert.equal(receipt.profile.app, app);
  assert.equal(receipt.profile.environment, environment);
  const subdomain =
    environment === 'staging' ? receipt.profile.host.split('.')[1] : undefined;
  assert.deepEqual(receipt.profile, profileFor(app, environment, subdomain));
  assert.equal(
    receipt.lockSha256,
    digest(readFileSync(new URL('../../bun.lock', import.meta.url)))
  );
  assert.equal(
    receipt.policySha256,
    digest(
      readFileSync(new URL('./wave1-native-profiles.json', import.meta.url))
    )
  );
  const dist = resolve(appRoot, 'dist');
  assert.deepEqual(inventory(dist), receipt.files, 'Artifact bytes changed');
  assertMailNodeImports(dist, app, Object.keys(inventory(dist)));
  const config = resolve(dist, 'wave1/wrangler.json');
  const emitted = contained(dist, resolve(dist, receipt.emitted));
  const base = json(emitted);
  const main = contained(dist, resolve(dirname(emitted), base.main));
  const assets = contained(
    dist,
    resolve(dirname(emitted), base.assets.directory)
  );
  assert.deepEqual(
    json(config),
    publicationConfig(base, receipt.profile, {
      main: relative(dirname(config), main),
      assets: relative(dirname(config), assets),
    }),
    'Publication config differs from source profile'
  );
  return { receipt, config, main, assets };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [mode, app, environment, sha, subdomain] = process.argv.slice(2);
  const appRoot = resolve('apps', app);
  if (mode === 'prepare') prepare(appRoot, app, environment, subdomain, sha);
  else if (mode === 'verify') verify(appRoot, app, environment, sha);
  else throw new Error('Expected prepare or verify');
}
