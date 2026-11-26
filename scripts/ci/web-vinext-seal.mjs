import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertModuleClosure } from './cf-build-output-publisher.mjs';
import { assertAssetHeadersStamp } from './web-vinext-bundle-check.mjs';
import {
  BUNDLE_DIR,
  MAIN_MODULE,
  assertFamilyId,
  assertSha,
  bundleModules,
  EXIT,
  hashFiles,
  listFiles,
  RECEIPT_SCHEMA,
  SEAL_FILE,
  SEAL_SCHEMA,
  SealError,
  scanForSecrets,
  secretShapes,
  sha256,
  stampModules,
  verifySealedFamily,
} from './web-vinext-sealed-artifact.mjs';

// CI side of the vinext family seal (web-vinext-families-build.yaml):
//   plan       validate the families input against families.json
//   env-guard  refuse a build env that holds anything but the public values
//   seal       turn one family build into the sealed directory layout
//   receipt    combine verified family seals into receipt.json
// Values are never printed; findings name variables, rules and paths only.

/** The build env: public NEXT_PUBLIC_* values, inlined into every bundle. */
export const PUBLIC_BUILD_ENV = Object.freeze([
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_DISCORD_LINK',
  'NEXT_PUBLIC_GA_MEASUREMENT_ID',
  'NEXT_PUBLIC_SHORTENER_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_TURNSTILE_SITE_KEY',
  'NEXT_PUBLIC_WEB_APP_URL',
]);
// build-family.sh derives this one from the committed gateway mounts.
const DERIVED_PUBLIC_ENV = new Set(['NEXT_PUBLIC_TUTURUUU_ACTIVE_APP_MOUNTS']);
const DEPLOY_CREDENTIAL = /^(?:CLOUDFLARE_|CF_|WRANGLER_API|VERCEL_TOKEN$)/u;
const SECRET_NAME = /(?:TOKEN|SECRET|PASSWORD|PRIVATE|PEPPER|CREDENTIAL|_KEY$)/u;
// Runner-provided names that hold no secret value.
const RUNNER_SAFE = new Set(['WRANGLER_SEND_METRICS']);
const RUNNER_PREFIX = /^(?:ACTIONS_|GITHUB_|RUNNER_)/u;

const fail = (code, message) => {
  throw new SealError(code, message);
};

/** Enabled family ids from families.json, in file order. */
export function enabledFamilies(familiesJsonPath) {
  const { families } = JSON.parse(readFileSync(familiesJsonPath, 'utf8'));
  return families.filter((family) => family.enabled).map((family) => family.id);
}

/** The families to build: `input` (comma list) or every enabled family. */
export function planFamilies(input, enabled) {
  const requested = String(input ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (requested.length === 0) return [...enabled];
  const unknown = requested.filter((id) => !enabled.includes(id));
  if (unknown.length > 0) {
    fail(EXIT.usage, `unknown or disabled families: ${unknown.join(', ')}`);
  }
  if (new Set(requested).size !== requested.length) {
    fail(EXIT.usage, 'families input repeats a family');
  }
  return enabled.filter((id) => requested.includes(id));
}

/**
 * Names of variables in `env` that look secret and are not public build
 * values: what the seal scans its output for.
 */
export function secretLookingEnv(env) {
  return Object.fromEntries(
    Object.entries(env).filter(
      ([name, value]) =>
        typeof value === 'string' &&
        value.length >= 8 &&
        !name.startsWith('NEXT_PUBLIC_') &&
        !RUNNER_SAFE.has(name) &&
        (SECRET_NAME.test(name) || DEPLOY_CREDENTIAL.test(name))
    )
  );
}

/**
 * Problems (names only) with a build env: a missing public value, an
 * unexpected NEXT_PUBLIC_* name (it would be inlined), a deploy credential,
 * a secret-looking variable, or a secret-shaped public value.
 */
export function buildEnvProblems(env) {
  const problems = [];
  for (const name of PUBLIC_BUILD_ENV) {
    if (!env[name]?.trim()) problems.push(`${name} is empty or unset`);
  }
  for (const name of Object.keys(env).sort()) {
    if (DEPLOY_CREDENTIAL.test(name) && !RUNNER_SAFE.has(name)) {
      problems.push(`${name} is a deploy credential name`);
    } else if (name.startsWith('NEXT_PUBLIC_')) {
      if (!PUBLIC_BUILD_ENV.includes(name) && !DERIVED_PUBLIC_ENV.has(name)) {
        problems.push(`${name} is not an allowed public build value`);
      } else if (secretShapes(env[name] ?? '').length > 0) {
        problems.push(`${name} holds a secret-shaped value`);
      }
    }
  }
  for (const name of Object.keys(secretLookingEnv(env)).sort()) {
    // Runner-provided names stay in the seal scan but cannot be unset here.
    if (!DEPLOY_CREDENTIAL.test(name) && !RUNNER_PREFIX.test(name)) {
      problems.push(`${name} looks like a secret`);
    }
  }
  return problems;
}

/** Where the family build put its client assets (bundle check order). */
export function resolveAssetsDir(appDir) {
  const candidates = [
    join(appDir, '.cloudflare/output/v1/workers/default/assets'),
    join(appDir, 'dist/client'),
  ];
  const found = candidates.find((dir) => existsSync(join(dir, '_headers')));
  if (!found) fail(EXIT.missing, 'no client assets with _headers were built');
  return found;
}


function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

/**
 * Copies one family build of `appDir` into `outDir` and seals it. Refuses
 * when the stamp, the bundle check, the module closure or the secret scan
 * fails; `forbidden` maps variable names to values that must not appear.
 */
export function sealFamily({
  appDir,
  family,
  sha,
  outDir,
  forbidden = {},
  build = {},
}) {
  assertFamilyId(family);
  assertSha(sha);
  const app = resolve(appDir);
  const out = resolve(outDir);
  if (existsSync(out)) fail(EXIT.usage, 'output directory already exists');
  const checkPath = join(app, `cloudflare/vinext/${family}.check.json`);
  const logPath = join(app, `cloudflare/vinext/${family}.dry-run.log`);
  for (const path of [checkPath, logPath, join(app, '.cloudflare/output')]) {
    if (!existsSync(path)) fail(EXIT.missing, `build output missing: ${path}`);
  }
  const check = JSON.parse(readFileSync(checkPath, 'utf8'));
  if (check.redisFree !== true || !check.reactServerDomWebpack) {
    fail(EXIT.tamper, 'bundle check did not pass the Redis and RSDW gates');
  }
  if (!check.assetHeaders) {
    fail(EXIT.stamp, 'bundle check ran without the build commit stamp');
  }

  const sourceAssets = resolveAssetsDir(app);
  try {
    assertAssetHeadersStamp(sourceAssets, sha);
  } catch (error) {
    fail(EXIT.stamp, error instanceof Error ? error.message : String(error));
  }
  mkdirSync(out, { recursive: true });
  cpSync(join(app, '.cloudflare/output'), join(out, 'output'), {
    recursive: true,
    verbatimSymlinks: true,
  });
  const insideOutput = sourceAssets.startsWith(
    `${join(app, '.cloudflare/output')}/`
  );
  const assetsDir = insideOutput
    ? `output/${sourceAssets.slice(join(app, '.cloudflare/output').length + 1)}`
    : 'client';
  if (!insideOutput) {
    cpSync(sourceAssets, join(out, 'client'), {
      recursive: true,
      verbatimSymlinks: true,
    });
  }
  writeJson(join(out, 'check.json'), check);
  cpSync(logPath, join(out, 'dry-run.log'));

  const bundleRoot = join(out, BUNDLE_DIR);
  if (!existsSync(join(bundleRoot, MAIN_MODULE))) {
    fail(EXIT.missing, `main module ${MAIN_MODULE} missing from the bundle`);
  }
  const modules = bundleModules(bundleRoot);
  try {
    assertModuleClosure(
      bundleRoot,
      Object.fromEntries(modules.map((name) => [name, { type: 'esm' }]))
    );
  } catch (error) {
    fail(EXIT.closure, error instanceof Error ? error.message : String(error));
  }
  const stamped = stampModules(bundleRoot, modules, sha);
  if (stamped.length === 0) {
    fail(EXIT.stamp, 'no module carries x-tuturuuu-build and the quoted sha');
  }

  const assetPaths = listFiles(join(out, assetsDir));
  writeJson(join(out, 'assets-manifest.json'), {
    assetsDir,
    headersFile: '_headers',
    note: 'Send _headers as the assets config, never as an uploaded asset.',
    files: hashFiles(join(out, assetsDir), assetPaths),
  });
  writeJson(join(out, 'imports-check.json'), {
    mainModule: MAIN_MODULE,
    moduleCount: modules.length,
    closure: 'ok',
    stampModules: stamped,
  });

  const files = listFiles(out);
  const findings = scanForSecrets(out, files, forbidden);
  if (findings.length > 0) {
    fail(EXIT.secret, `refusing to seal: ${findings.slice(0, 5).join('; ')}`);
  }
  const hashed = hashFiles(out, files);
  const seal = {
    schema: SEAL_SCHEMA,
    family,
    worker: `tuturuuu-web-vinext-${family}`,
    sha,
    deploymentStamp: sha.slice(0, 12),
    bundleDir: BUNDLE_DIR,
    mainModule: MAIN_MODULE,
    assetsDir,
    stampModule: stamped[0],
    moduleCount: modules.length,
    modules: Object.fromEntries(
      modules.map((name) => [name, hashed[`${BUNDLE_DIR}/${name}`].sha256])
    ),
    fileCount: files.length,
    files: hashed,
    build,
  };
  writeJson(join(out, SEAL_FILE), seal);
  return verifySealedFamily(out, sha, { expectedFamily: family });
}

/** Verifies every sealed directory and writes the combined receipt. */
export function writeReceipt({
  sha,
  familyDirs,
  outPath,
  expected,
  run = {},
}) {
  assertSha(sha);
  const ids = Object.keys(familyDirs).sort();
  if (expected) {
    const want = [...expected].sort();
    if (ids.join(',') !== want.join(',')) {
      fail(EXIT.missing, `sealed families ${ids.join(',')} != ${want.join(',')}`);
    }
  }
  const families = {};
  for (const id of ids) {
    const { seal, sealSha256 } = verifySealedFamily(familyDirs[id], sha, {
      expectedFamily: id,
    });
    families[id] = {
      worker: seal.worker,
      sealSha256,
      moduleCount: seal.moduleCount,
      fileCount: seal.fileCount,
    };
  }
  const receipt = { schema: RECEIPT_SCHEMA, sha, run, families };
  mkdirSync(dirname(resolve(outPath)), { recursive: true });
  writeJson(outPath, receipt);
  return { receipt, receiptSha256: sha256(readFileSync(outPath)) };
}

/** Non-secret run identity recorded in seals and the receipt. */
export function runIdentity(env) {
  return {
    repository: env.GITHUB_REPOSITORY ?? null,
    runId: env.GITHUB_RUN_ID ?? null,
    runAttempt: env.GITHUB_RUN_ATTEMPT ?? null,
    workflowRef: env.GITHUB_WORKFLOW_REF ?? null,
  };
}

function option(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function options(argv, name) {
  return argv.flatMap((value, index) =>
    value === name && argv[index + 1] ? [argv[index + 1]] : []
  );
}

export function main(argv, env = process.env) {
  const [command, ...rest] = argv;
  if (command === 'plan') {
    const families = planFamilies(
      option(rest, '--families'),
      enabledFamilies(option(rest, '--config'))
    );
    console.log(JSON.stringify(families));
    return EXIT.ok;
  }
  if (command === 'env-guard') {
    const problems = buildEnvProblems(env);
    for (const problem of problems) console.error(problem);
    if (problems.length > 0) return EXIT.secret;
    console.log(`build env holds the ${PUBLIC_BUILD_ENV.length} public values only`);
    return EXIT.ok;
  }
  if (command === 'seal') {
    const forbidden = { ...secretLookingEnv(env) };
    for (const name of options(rest, '--forbid-env')) {
      if (env[name]) forbidden[name] = env[name];
    }
    const { seal, sealSha256 } = sealFamily({
      appDir: option(rest, '--app'),
      family: option(rest, '--family'),
      sha: option(rest, '--sha'),
      outDir: option(rest, '--out'),
      forbidden,
      build: runIdentity(env),
    });
    console.log(
      `sealed ${seal.family}: ${seal.moduleCount} modules, ${seal.fileCount} files, seal.json sha256 ${sealSha256}`
    );
    return EXIT.ok;
  }
  if (command === 'receipt') {
    const root = option(rest, '--root');
    const expected = String(option(rest, '--families') ?? '')
      .split(',')
      .filter(Boolean);
    const familyDirs = Object.fromEntries(
      expected.map((id) => [assertFamilyId(id), join(root, `web-vinext-sealed-${id}`)])
    );
    const { receipt, receiptSha256 } = writeReceipt({
      sha: option(rest, '--sha'),
      familyDirs,
      outPath: option(rest, '--out'),
      expected,
      run: runIdentity(env),
    });
    for (const [id, entry] of Object.entries(receipt.families)) {
      console.log(`${id}: seal.json sha256 ${entry.sealSha256}`);
    }
    console.log(`receipt.json sha256 ${receiptSha256}`);
    return EXIT.ok;
  }
  fail(EXIT.usage, 'usage: web-vinext-seal.mjs plan|env-guard|seal|receipt ...');
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
