import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';

const root = fileURLToPath(new URL('../../', import.meta.url));
const pluginPath = 'dist/cli/build/patches/plugins/load-manifest.js';
const normalizePath = 'dist/cli/utils/normalize-path.js';
const patchPath = join(root, 'patches/@opennextjs%2Fcloudflare@1.20.6.patch');
const nextLoaderPath = createRequire(import.meta.url).resolve(
  'next/dist/server/load-manifest.external.js'
);

// Apply the actual repository hunk with exact context, never a replacement
// implementation of the adapter's manifest selection or inlining behavior.
function applyPluginHunk(source, patch) {
  const section = patch.split(`diff --git a/${pluginPath} b/${pluginPath}\n`);
  assert.equal(section.length, 2, 'exactly one plugin patch section');
  const lines = section[1].trimEnd().split('\n');
  const header = lines.findIndex((line) => line.startsWith('@@ '));
  assert.ok(header >= 0, 'plugin hunk is present');
  const match = /^@@ -(\d+),(\d+) \+(\d+),(\d+) @@/.exec(lines[header]);
  assert.ok(match, 'explicit unified hunk ranges');
  const oldLines = [];
  const newLines = [];
  for (const line of lines.slice(header + 1)) {
    assert.ok([' ', '-', '+'].includes(line[0]), 'one supported hunk only');
    if (line[0] !== '+') oldLines.push(line.slice(1));
    if (line[0] !== '-') newLines.push(line.slice(1));
  }
  assert.equal(oldLines.length, Number(match[2]));
  assert.equal(newLines.length, Number(match[4]));
  assert.equal(match[1], match[3], 'unchanged hunk position');
  const sourceLines = source.split('\n');
  const start = Number(match[1]) - 1;
  assert.deepEqual(sourceLines.slice(start, start + oldLines.length), oldLines);
  sourceLines.splice(start, oldLines.length, ...newLines);
  return sourceLines.join('\n');
}

function loadManifestFunction(contents) {
  const start = contents.indexOf('function loadManifest(');
  const end = contents.indexOf('\nfunction evalManifest(', start);
  assert.ok(
    start >= 0 && end > start,
    'genuine loadManifest function boundaries'
  );
  return contents.slice(start, end);
}

async function loaderFromApi(inlineLoadManifest, outputDir) {
  let filters;
  const sentinel = {};
  const updater = {
    updateContent(name, suppliedFilters) {
      assert.equal(name, 'inline-load-manifest');
      filters = suppliedFilters;
      return sentinel;
    },
  };
  assert.equal(
    inlineLoadManifest(updater, {
      outputDir,
      monorepoRoot: outputDir,
      appBuildOutputPath: outputDir,
    }),
    sentinel
  );
  assert.equal(filters.length, 1);
  const contents = await readFile(nextLoaderPath, 'utf8');
  assert.ok(filters[0].filter.test(nextLoaderPath));
  assert.ok(filters[0].contentFilter.test(contents));
  const transformed = await filters[0].callback({ contents });
  const transformedFunction = loadManifestFunction(transformed);
  assert.notEqual(
    transformedFunction,
    loadManifestFunction(contents),
    'genuine loadManifest must be transformed, not silently retained'
  );
  assert.match(transformedFunction, /Unexpected loadManifest/);
  const exports = {};
  const context = {
    exports,
    module: { exports },
    require: createRequire(nextLoaderPath),
    process: { env: {} },
  };
  runInNewContext(transformed, context);
  const loadManifest = context.module.exports.loadManifest;
  assert.equal(
    typeof loadManifest,
    'function',
    'genuine transformed loader export'
  );
  return loadManifest;
}

test('repository adapter patch inlines genuine preview props without fallbacks', async (t) => {
  const temp = await mkdtemp(join(tmpdir(), 'cloudflare-preview-props-test-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const installed = await realpath(
    join(root, 'node_modules/@opennextjs/cloudflare')
  );
  const packageInfo = JSON.parse(
    await readFile(join(installed, 'package.json'), 'utf8')
  );
  assert.equal(packageInfo.version, '1.20.6');
  const originalSource = await readFile(join(installed, pluginPath), 'utf8');
  const patch = await readFile(patchPath, 'utf8');
  const patched = join(temp, 'adapter');
  for (const relative of ['package.json', pluginPath, normalizePath]) {
    await mkdir(dirname(join(patched, relative)), { recursive: true });
    await copyFile(join(installed, relative), join(patched, relative));
  }
  // The copied genuine plugin retains its own relative imports and the same
  // Bun-installed dependency graph, including the native AST implementation.
  await symlink(
    dirname(dirname(installed)),
    join(patched, 'node_modules'),
    'dir'
  );
  await writeFile(
    join(patched, pluginPath),
    applyPluginHunk(originalSource, patch)
  );
  const originalApi = await import(
    pathToFileURL(join(installed, pluginPath)).href
  );
  const patchedApi = await import(
    pathToFileURL(join(patched, pluginPath)).href
  );
  const outputDir = join(temp, 'output');
  const next = join(outputDir, 'server-functions/default/.next');
  const previewPath = join(next, 'server/preview-props.json');
  await mkdir(dirname(previewPath), { recursive: true });
  const preview = {
    previewModeId: randomUUID(),
    previewModeSigningKey: randomUUID(),
    previewModeEncryptionKey: randomUUID(),
  };
  const required = { version: 1, files: ['real-required-fixture'] };
  await writeFile(previewPath, JSON.stringify(preview));
  await writeFile(
    join(next, 'required-server-files.json'),
    JSON.stringify(required)
  );
  await writeFile(
    join(next, 'unknown-props.json'),
    JSON.stringify({ unexpected: true })
  );

  await t.test(
    'unpatched genuine API rejects the present preview manifest',
    async () => {
      const loadManifest = await loaderFromApi(
        originalApi.inlineLoadManifest,
        outputDir
      );
      assert.throws(() => loadManifest(previewPath), /Unexpected loadManifest/);
    }
  );
  const loadManifest = await loaderFromApi(
    patchedApi.inlineLoadManifest,
    outputDir
  );
  await t.test('patched API inlines the exact real preview JSON', () => {
    assert.deepEqual(
      JSON.parse(JSON.stringify(loadManifest(previewPath))),
      preview
    );
  });
  await t.test('existing required manifest selection is preserved', () => {
    assert.deepEqual(
      JSON.parse(
        JSON.stringify(loadManifest(join(next, 'required-server-files.json')))
      ),
      required
    );
  });
  await t.test('even a present unknown JSON path is rejected', () => {
    assert.throws(
      () => loadManifest(join(next, 'unknown-props.json')),
      /Unexpected loadManifest/
    );
  });
  await t.test(
    'absent preview JSON remains an error rather than an empty fallback',
    async () => {
      await rm(previewPath);
      const withoutPreview = await loaderFromApi(
        patchedApi.inlineLoadManifest,
        outputDir
      );
      assert.throws(
        () => withoutPreview(previewPath),
        /Unexpected loadManifest/
      );
    }
  );
});
