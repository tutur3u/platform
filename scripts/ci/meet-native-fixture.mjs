import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  EMITTED_DEFAULTS,
  NORMALIZATION_PROFILE,
} from './meet-emitted-defaults.mjs';
import { hash } from './meet-native-profile.mjs';

const { identity, secretNames } = createRequire(import.meta.url)(
  './verify-meet-start-output.js'
);
export const sourceSHA = 'a'.repeat(40);
export async function meetFixture(t, { server = 'ssr' } = {}) {
  const root = await realpath(
    await mkdtemp(join(tmpdir(), 'meet-finite-unit-'))
  );
  t.after(() => rm(root, { recursive: true, force: true }));
  const app = join(root, 'apps/meet'),
    caseRoot = join(root, 'case');
  for (const path of [
    `apps/meet/dist/${server}`,
    'apps/meet/dist/client',
    'apps/meet/.wrangler/deploy',
    'case/native-sdk-temp',
    'diagnostics',
  ])
    await mkdir(join(root, path), { recursive: true });
  const normalization = {
    schema: 1,
    profile: structuredClone(NORMALIZATION_PROFILE),
    inputPath: '/synthetic/.void-wrangler.jsonc',
    inputHash: hash('synthetic'),
    platform: 'non-windows',
  };
  const config = {
    ...structuredClone(identity),
    ...structuredClone(EMITTED_DEFAULTS),
    main: 'main.mjs',
    no_bundle: true,
    upload_source_maps: true,
    rules: [{ type: 'ESModule', globs: ['**/*.js', '**/*.mjs'] }],
    assets: {
      binding: 'ASSETS',
      directory: '../client',
      run_worker_first: true,
      not_found_handling: 'none',
    },
    secrets: { required: [...secretNames] },
    configPath: normalization.inputPath,
    userConfigPath: normalization.inputPath,
    topLevelName: identity.name,
    definedEnvironments: [],
  };
  await writeFile(join(app, 'package.json'), '{}');
  await writeFile(join(root, 'bun.lock'), 'synthetic lock provenance');
  await writeFile(
    join(app, `dist/${server}/main.mjs`),
    'export default {}; export class MeetLiveDurableObject {} export class MeetingAIProvider {}'
  );
  await writeFile(
    join(app, 'dist/client/asset.js'),
    'export default "fixture"'
  );
  await mkdir(join(app, 'dist/empty-directory'));
  const pointerPath = join(app, '.wrangler/deploy/config.json');
  await writeFile(
    pointerPath,
    JSON.stringify({
      configPath: `../../dist/${server}/wrangler.json`,
      auxiliaryWorkers: [],
    })
  );
  async function save() {
    await writeFile(
      join(app, `dist/${server}/wrangler.json`),
      JSON.stringify(config)
    );
    const files = {};
    async function visit(path, name) {
      for (const entry of await readdir(path, { withFileTypes: true })) {
        const part = `${name}/${entry.name}`;
        if (entry.isDirectory()) await visit(join(path, entry.name), part);
        else files[part] = hash(await readFile(join(path, entry.name)));
      }
    }
    await visit(join(app, 'dist'), 'dist');
    files['.wrangler/deploy/config.json'] = hash(await readFile(pointerPath));
    await writeFile(
      join(app, 'meet-artifact.json'),
      JSON.stringify({
        schema: 2,
        sha: sourceSHA,
        config: `dist/${server}/wrangler.json`,
        files,
        normalization,
      })
    );
  }
  await save();
  const foreignPath = join(caseRoot, 'foreign');
  await writeFile(foreignPath, 'foreign sentinel');
  return {
    root,
    app,
    config,
    normalization,
    save,
    pointerPath,
    options: {
      appDirectory: app,
      sourceSHA,
      ownerPackage: join(app, 'package.json'),
    },
    context: {
      caseRoot,
      tempRoot: join(caseRoot, 'native-sdk-temp'),
      diagnosticRoot: join(root, 'diagnostics'),
      foreignPath,
      foreignValue: 'foreign sentinel',
    },
  };
}
