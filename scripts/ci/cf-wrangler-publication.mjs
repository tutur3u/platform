// Preserve production DO migration tags until the cf exports transition is rehearsed.
import assert from 'node:assert/strict';
import {
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertBuildOutputParity,
  normalizeWranglerConfig,
  parseJsonc,
  readBuildOutputConfig,
} from './cf-worker-parity.mjs';

export function prepareWranglerPublication(
  appDir,
  baselinePath,
  declarationPath,
  accountId
) {
  assert.ok(accountId?.trim(), 'CLOUDFLARE_ACCOUNT_ID is required');
  const identity = assertBuildOutputParity(appDir, baselinePath, accountId);
  const declaration = parseJsonc(readFileSync(declarationPath, 'utf8'));
  assert.deepEqual(
    normalizeWranglerConfig(declaration),
    identity,
    'publication declaration must match qualified artifact identity'
  );
  const classes = Object.entries(identity.durableObjectClasses);
  assert.ok(
    classes.length > 0 && classes.every(([, storage]) => storage === 'sqlite'),
    'only rehearsable SQLite DO profiles are supported'
  );
  assert.deepEqual(
    declaration.migrations,
    [{ tag: 'v1', new_sqlite_classes: classes.map(([name]) => name) }],
    'retain the applied v1 migration history'
  );
  const { worker } = readBuildOutputConfig(appDir);
  const bundle = realpathSync(
    join(appDir, '.cloudflare/output/v0/workers/default/bundle')
  );
  const app = realpathSync(appDir);
  assert.ok(bundle.startsWith(app + sep), 'bundle escapes app');
  const modules = Object.keys(worker.manifest.modules);
  assert.ok(
    modules.includes(worker.manifest.mainModule),
    'main module must be declared'
  );
  const metadata = '.vite/manifest.json';
  // lstat (not existsSync, which follows links) so a dangling symlink is
  // still rejected; only a genuinely absent entry is skipped.
  const lstatIfPresent = (path) => {
    try {
      return lstatSync(path);
    } catch (error) {
      if (error?.code === 'ENOENT') return undefined;
      throw error;
    }
  };
  for (const name of ['.vite', metadata]) {
    const stat = lstatIfPresent(join(bundle, name));
    if (stat) assert.ok(!stat.isSymbolicLink(), 'Vite metadata is symlinked');
  }
  const manifestStat = lstatIfPresent(join(bundle, metadata));
  if (manifestStat) {
    assert.ok(manifestStat.isFile(), 'Vite manifest is not a file');
  }
  assert.deepEqual(
    readdirSync(bundle, { recursive: true })
      .filter(
        (name) => name !== metadata && statSync(join(bundle, name)).isFile()
      )
      .sort(),
    [...modules].sort(),
    'bundle must contain exactly the qualified modules'
  );
  for (const [name, module] of Object.entries(worker.manifest.modules)) {
    assert.ok(
      !isAbsolute(name) && !name.split(/[\\/]/).includes('..'),
      'module path escapes bundle'
    );
    assert.equal(
      module.type,
      'esm',
      'publication adapter supports only ES modules'
    );
    const actual = realpathSync(join(bundle, name));
    assert.ok(
      actual.startsWith(bundle + sep) && statSync(actual).isFile(),
      'module escapes bundle'
    );
  }
  const output = join(app, '.cloudflare/wrangler-publication.json');
  writeFileSync(
    output,
    `${JSON.stringify(
      {
        ...declaration,
        main: relative(
          dirname(output),
          join(bundle, worker.manifest.mainModule)
        ),
        no_bundle: true,
        find_additional_modules: true,
        rules: [
          {
            type: 'ESModule',
            globs: ['**/*.js', '**/*.mjs'],
            fallthrough: true,
          },
        ],
      },
      null,
      2
    )}\n`
  );
  return output;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [appDir, baseline, declaration, accountId] = process.argv.slice(2);
  assert.ok(
    appDir && baseline && declaration,
    'usage: <app> <baseline> <declaration> <account-id>'
  );
  console.log(
    prepareWranglerPublication(
      resolve(appDir),
      baseline,
      declaration,
      accountId ?? readBuildOutputConfig(resolve(appDir)).accountId
    )
  );
}
