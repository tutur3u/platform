import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { join, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertModuleClosure } from './cf-build-output-publisher.mjs';
import { assertAssetHeadersStamp } from './web-vinext-bundle-check.mjs';

// Verifier for one sealed vinext family directory, as uploaded by
// .github/workflows/web-vinext-families-build.yaml and consumed by the
// operator publish toolkit before any upload. It re-hashes every file,
// compares the Worker module set, checks the build stamp, the module closure
// and the secret-shape scan. It never prints file contents.
//
// Exit codes (also in apps/docs/build/devops/web-vinext-families.mdx):
//   0  verified
//   2  usage error, or seal.json / receipt.json missing or unreadable
//   3  pin mismatch: wrong or malformed sha, family or schema
//   4  tamper: a hash, size, module count or file set differs, or a symlink
//   5  missing: a sealed file, module, main module or assets dir is absent
//   6  stamp: `_headers` lacks the x-tuturuuu-build rule, or no module
//      carries the literal header name with the quoted pin sha
//   7  closure: a module imports an unsealed module
//   8  secret: a secret-shaped value or a forbidden file name is present
export const SEAL_SCHEMA = 'tuturuuu.web-vinext-seal/v1';
export const RECEIPT_SCHEMA = 'tuturuuu.web-vinext-seal-receipt/v1';
export const STAMP_HEADER = 'x-tuturuuu-build';
export const SEAL_FILE = 'seal.json';
// The vinext family layout: the Worker entry and the two places a build can
// put its client assets (see web-vinext-bundle-check.mjs assetsDirCandidates).
export const BUNDLE_DIR = 'output/v1/workers/default/bundle';
export const MAIN_MODULE = 'index.mjs';
export const ASSETS_DIRS = Object.freeze([
  'output/v1/workers/default/assets',
  'client',
]);
const SHA256 = /^[0-9a-f]{64}$/u;
export const EXIT = Object.freeze({
  ok: 0,
  usage: 2,
  pin: 3,
  tamper: 4,
  missing: 5,
  stamp: 6,
  closure: 7,
  secret: 8,
});

const SHA = /^[0-9a-f]{40}$/u;
export const FAMILY = /^[a-z][a-z0-9-]{0,62}$/u;
const MODULE = /\.(?:m?js)$/u;

export class SealError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new SealError(code, message);
};

export const sha256 = (data) => createHash('sha256').update(data).digest('hex');

export function assertSha(value, label = 'sha') {
  if (typeof value !== 'string' || !SHA.test(value)) {
    fail(EXIT.pin, `${label} must be 40 lowercase hex`);
  }
  return value;
}

export function assertFamilyId(value) {
  if (typeof value !== 'string' || !FAMILY.test(value)) {
    fail(EXIT.pin, `family id is malformed`);
  }
  return value;
}

/** Sorted posix paths of every regular file under `root`; symlinks refused. */
export function listFiles(root) {
  const files = [];
  const visit = (directory) => {
    for (const name of readdirSync(directory).sort()) {
      const path = join(directory, name);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) {
        fail(EXIT.tamper, `symlink in sealed tree: ${relative(root, path)}`);
      }
      if (stat.isDirectory()) visit(path);
      else if (stat.isFile()) {
        files.push(relative(root, path).split('\\').join('/'));
      } else fail(EXIT.tamper, `not a regular file: ${relative(root, path)}`);
    }
  };
  visit(root);
  return files.sort();
}

/** `{ path: { sha256, bytes } }` for `paths` under `root`, keys sorted. */
export function hashFiles(root, paths) {
  const result = {};
  for (const path of [...paths].sort()) {
    const data = readFileSync(join(root, path));
    result[path] = { sha256: sha256(data), bytes: data.length };
  }
  return result;
}

/**
 * Worker modules of a bundle: every `.js`/`.mjs` file, skipping `.map` files
 * and dot directories (the same set the cf Build Output publisher counts).
 */
export function bundleModules(bundleRoot) {
  return listFiles(bundleRoot).filter(
    (path) =>
      MODULE.test(path) &&
      !path.split('/').some((segment) => segment.startsWith('.'))
  );
}

/** Bundle-relative modules carrying the header name and the quoted sha. */
export function stampModules(bundleRoot, modules, sha) {
  const quoted = [`"${sha}"`, `'${sha}'`, `\`${sha}\``];
  return modules.filter((path) => {
    const source = readFileSync(join(bundleRoot, path), 'latin1');
    return (
      source.includes(STAMP_HEADER) &&
      quoted.some((value) => source.includes(value))
    );
  });
}

// Shapes that are never public: Supabase secret keys, service-role JWTs,
// PEM private keys and GitHub tokens. Public publishable and anon keys pass.
// Cloudflare API tokens carry no fixed prefix, so only their value (from
// the job env) can be scanned for.
const SECRET_SHAPES = [
  ['supabase-secret-key', /sb_secret_[A-Za-z0-9_-]{20,}/gu],
  ['stripe-live-key', /\b[rs]k_live_[A-Za-z0-9]{24,}/gu],
  ['aws-access-key-id', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/gu],
  ['openai-api-key', /\bsk-(?:proj|svcacct|admin)-[A-Za-z0-9_-]{40,}/gu],
  ['anthropic-api-key', /\bsk-ant-[a-z]+\d{2}-[A-Za-z0-9_-]{80,}/gu],
  [
    'pem-private-key',
    /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----[\s\\n]*[A-Za-z0-9+/]{64}/gu,
  ],
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_\w{60,})/gu],
];
const JWT = /eyJ[A-Za-z0-9_-]{8,}\.(eyJ[A-Za-z0-9_-]{8,})\.[A-Za-z0-9_-]{8,}/gu;
const FORBIDDEN_NAME = /^(?:\.dev\.vars.*|\.env(?:\..*)?|secrets\.json)$/u;

function jwtRole(segment) {
  try {
    return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'))?.role;
  } catch {
    return null;
  }
}

/** Rule names (never values) of secret shapes found in `text`. */
export function secretShapes(text) {
  const found = new Set();
  for (const [name, pattern] of SECRET_SHAPES) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) found.add(name);
  }
  for (const match of text.matchAll(JWT)) {
    if (jwtRole(match[1]) === 'service_role') found.add('service-role-jwt');
  }
  return [...found].sort();
}

/**
 * Scans every file for secret shapes and for each forbidden value (a raw
 * substring, at least 8 characters). Findings name the file and the rule or
 * variable name only; values are never printed.
 */
export function scanForSecrets(root, files, forbidden = {}) {
  const findings = [];
  const values = Object.entries(forbidden)
    .filter(([, value]) => typeof value === 'string' && value.length >= 8)
    .map(([name, value]) => [name, Buffer.from(value, 'utf8')]);
  for (const path of files) {
    const base = posix.basename(path);
    if (FORBIDDEN_NAME.test(base)) findings.push(`${path}: forbidden file`);
    const data = readFileSync(join(root, path));
    for (const [name, value] of values) {
      if (data.includes(value)) findings.push(`${path}: value of ${name}`);
    }
    for (const rule of secretShapes(data.toString('latin1'))) {
      findings.push(`${path}: ${rule}`);
    }
  }
  return findings;
}

function readJson(path, code, label) {
  if (!existsSync(path)) fail(code, `${label} is missing`);
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    fail(code, `${label} is not valid JSON`);
  }
}

function insideSealed(rel, label) {
  if (
    typeof rel !== 'string' ||
    rel === '' ||
    rel.startsWith('/') ||
    rel.includes('\\') ||
    posix.normalize(rel) !== rel ||
    rel.split('/').includes('..')
  ) {
    fail(EXIT.tamper, `${label} is not a relative sealed path`);
  }
  return rel;
}

/**
 * Re-verifies a sealed family directory against `expectedSha` (and
 * `expectedFamily` when given). Returns the parsed seal and its sha256.
 */
export function verifySealedFamily(dir, expectedSha, { expectedFamily } = {}) {
  const root = resolve(dir);
  assertSha(expectedSha, 'expected sha');
  const sealPath = join(root, SEAL_FILE);
  const seal = readJson(sealPath, EXIT.usage, SEAL_FILE);
  const sealSha256 = sha256(readFileSync(sealPath));
  if (seal.schema !== SEAL_SCHEMA) fail(EXIT.pin, 'unknown seal schema');
  if (assertSha(seal.sha, 'seal sha') !== expectedSha) {
    fail(EXIT.pin, 'seal sha differs from the expected sha');
  }
  assertFamilyId(seal.family);
  if (expectedFamily && seal.family !== expectedFamily) {
    fail(EXIT.pin, `seal is for family ${seal.family}`);
  }
  if (seal.worker !== `tuturuuu-web-vinext-${seal.family}`) {
    fail(EXIT.pin, 'seal worker name does not match its family');
  }
  if (seal.deploymentStamp !== expectedSha.slice(0, 12)) {
    fail(EXIT.pin, 'seal deployment stamp does not match the sha');
  }

  // Every file, exactly: nothing missing, nothing extra, every hash equal.
  const sealed = seal.files ?? {};
  const listed = Object.keys(sealed);
  if (listed.length === 0) fail(EXIT.tamper, 'seal lists no files');
  if (listed.join('\n') !== [...listed].sort().join('\n')) {
    fail(EXIT.tamper, 'seal file list is not sorted');
  }
  const onDisk = listFiles(root).filter((path) => path !== SEAL_FILE);
  const missing = listed.filter((path) => !onDisk.includes(path));
  if (missing.length > 0) {
    fail(
      EXIT.missing,
      `sealed files missing: ${missing.slice(0, 5).join(', ')}`
    );
  }
  const extra = onDisk.filter((path) => !Object.hasOwn(sealed, path));
  if (extra.length > 0) {
    fail(
      EXIT.tamper,
      `unsealed files present: ${extra.slice(0, 5).join(', ')}`
    );
  }
  const actual = hashFiles(root, onDisk);
  for (const path of listed) {
    if (
      actual[path].sha256 !== sealed[path]?.sha256 ||
      actual[path].bytes !== sealed[path]?.bytes
    ) {
      fail(EXIT.tamper, `hash mismatch: ${path}`);
    }
  }

  // Worker modules: the sealed set equals the bundle's module set.
  if (seal.bundleDir !== BUNDLE_DIR) fail(EXIT.pin, 'unexpected bundleDir');
  if (seal.mainModule !== MAIN_MODULE) fail(EXIT.pin, 'unexpected mainModule');
  if (!ASSETS_DIRS.includes(seal.assetsDir)) {
    fail(EXIT.pin, 'unexpected assetsDir');
  }
  const bundleDir = insideSealed(seal.bundleDir, 'bundleDir');
  const bundleRoot = join(root, bundleDir);
  if (!existsSync(bundleRoot)) fail(EXIT.missing, 'bundle directory missing');
  const modules = seal.modules ?? {};
  const names = Object.keys(modules);
  if (names.join('\n') !== [...names].sort().join('\n')) {
    fail(EXIT.tamper, 'seal module list is not sorted');
  }
  if (seal.moduleCount !== names.length) {
    fail(EXIT.tamper, 'seal module count differs from its module list');
  }
  if (!Object.hasOwn(modules, seal.mainModule)) {
    fail(EXIT.missing, 'main module is not sealed');
  }
  const present = bundleModules(bundleRoot);
  const absent = names.filter((name) => !present.includes(name));
  if (absent.length > 0) {
    fail(
      EXIT.missing,
      `sealed modules missing: ${absent.slice(0, 5).join(', ')}`
    );
  }
  const unlisted = present.filter((name) => !Object.hasOwn(modules, name));
  if (unlisted.length > 0) {
    fail(EXIT.tamper, `unsealed modules: ${unlisted.slice(0, 5).join(', ')}`);
  }
  for (const name of names) {
    if (modules[name] !== sealed[`${bundleDir}/${name}`]?.sha256) {
      fail(EXIT.tamper, `module hash mismatch: ${name}`);
    }
  }

  // Assets: the manifest matches the sealed files under assetsDir.
  const assetsDir = insideSealed(seal.assetsDir, 'assetsDir');
  if (!existsSync(join(root, assetsDir))) fail(EXIT.missing, 'assets missing');
  const manifest = readJson(
    join(root, 'assets-manifest.json'),
    EXIT.missing,
    'assets-manifest.json'
  );
  if (manifest.assetsDir !== assetsDir) {
    fail(EXIT.tamper, 'assets manifest names another assets directory');
  }
  const assets = manifest.files ?? {};
  for (const [path, entry] of Object.entries(assets)) {
    insideSealed(path, 'asset path');
    if (
      !SHA256.test(entry?.sha256 ?? '') ||
      !Number.isSafeInteger(entry?.bytes) ||
      entry.bytes < 0
    ) {
      fail(EXIT.tamper, `malformed asset entry: ${path}`);
    }
    const file = sealed[`${assetsDir}/${path}`];
    if (file?.sha256 !== entry.sha256 || file?.bytes !== entry.bytes) {
      fail(EXIT.tamper, `asset hash mismatch: ${path}`);
    }
  }
  const assetFiles = listed.filter((path) => path.startsWith(`${assetsDir}/`));
  if (assetFiles.length !== Object.keys(assets).length) {
    fail(EXIT.tamper, 'assets manifest differs from the sealed assets');
  }

  // Stamp: `_headers` rule and a module with the header name + quoted sha.
  try {
    assertAssetHeadersStamp(join(root, assetsDir), expectedSha);
  } catch (error) {
    fail(EXIT.stamp, error instanceof Error ? error.message : String(error));
  }
  const stamped = stampModules(bundleRoot, names, expectedSha);
  if (stamped.length === 0) {
    fail(EXIT.stamp, `no module carries ${STAMP_HEADER} and the quoted sha`);
  }
  if (!stamped.includes(seal.stampModule)) {
    fail(EXIT.stamp, 'seal stampModule does not carry the stamp');
  }

  // Closure: no module imports an unsealed module.
  try {
    assertModuleClosure(
      bundleRoot,
      Object.fromEntries(names.map((name) => [name, { type: 'esm' }]))
    );
  } catch (error) {
    fail(EXIT.closure, error instanceof Error ? error.message : String(error));
  }

  const findings = scanForSecrets(root, onDisk);
  if (findings.length > 0) {
    fail(EXIT.secret, `secret scan: ${findings.slice(0, 5).join('; ')}`);
  }
  return { seal, sealSha256 };
}

/**
 * Verifies a receipt and every family it lists. `familyDirs` maps a family
 * id to its sealed directory.
 */
export function verifyReceipt(receiptPath, familyDirs, expectedSha) {
  const receipt = readJson(receiptPath, EXIT.usage, 'receipt.json');
  if (receipt.schema !== RECEIPT_SCHEMA)
    fail(EXIT.pin, 'unknown receipt schema');
  if (assertSha(receipt.sha, 'receipt sha') !== assertSha(expectedSha)) {
    fail(EXIT.pin, 'receipt sha differs from the expected sha');
  }
  const families = Object.keys(receipt.families ?? {});
  if (families.length === 0) fail(EXIT.tamper, 'receipt lists no families');
  for (const family of families) {
    const dir = familyDirs[family];
    if (!dir) fail(EXIT.missing, `no sealed directory for ${family}`);
    const { sealSha256 } = verifySealedFamily(dir, expectedSha, {
      expectedFamily: family,
    });
    if (receipt.families[family].sealSha256 !== sealSha256) {
      fail(EXIT.tamper, `seal.json of ${family} differs from the receipt`);
    }
  }
  return receipt;
}

/** `<root>/<family>` directories (or `web-vinext-sealed-<family>`). */
export function familyDirsUnder(root) {
  const dirs = {};
  for (const name of readdirSync(root).sort()) {
    const path = join(root, name);
    if (!lstatSync(path).isDirectory() || !existsSync(join(path, SEAL_FILE))) {
      continue;
    }
    const family = name.replace(/^web-vinext-sealed-/u, '');
    if (FAMILY.test(family)) dirs[family] = path;
  }
  return dirs;
}

const USAGE =
  'usage: web-vinext-sealed-artifact.mjs <sealed-family-dir> <sha> [--family <id>]\n' +
  '       web-vinext-sealed-artifact.mjs --receipt <receipt.json> <sealed-root> <sha>';

export function main(argv) {
  if (argv[0] === '--receipt') {
    if (argv.length !== 4) fail(EXIT.usage, USAGE);
    const receipt = verifyReceipt(argv[1], familyDirsUnder(argv[2]), argv[3]);
    console.log(
      `verified receipt for ${Object.keys(receipt.families).join(', ')} at ${receipt.sha}`
    );
    return EXIT.ok;
  }
  const [dir, sha, flag, family] = argv;
  if (!dir || !sha || (flag && (flag !== '--family' || !family))) {
    fail(EXIT.usage, USAGE);
  }
  if (argv.length !== (flag ? 4 : 2)) fail(EXIT.usage, USAGE);
  const { seal, sealSha256 } = verifySealedFamily(dir, sha, {
    expectedFamily: family,
  });
  console.log(
    `verified ${seal.family} at ${seal.sha}: ${seal.moduleCount} modules, seal.json sha256 ${sealSha256}`
  );
  return EXIT.ok;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = error instanceof SealError ? error.code : EXIT.usage;
  }
}
