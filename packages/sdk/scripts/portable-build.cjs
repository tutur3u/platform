const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { builtinModules } = require('node:module');
const { parse } = require('@babel/parser');

const embeddedPackages = new Set(['@tuturuuu/internal-api', '@tuturuuu/utils']);
const portableEntries = new Set([
  '@tuturuuu/internal-api/client',
  '@tuturuuu/internal-api/external-projects',
  '@tuturuuu/internal-api/product-feedback',
  '@tuturuuu/internal-api/tasks',
  '@tuturuuu/internal-api/users',
  '@tuturuuu/internal-api/workspaces',
  '@tuturuuu/utils/playground-schema',
  '@tuturuuu/utils/task-description-codec',
  '@tuturuuu/utils/task-description-content',
]);
const portableFiles = new Set([
  'internal-api/client.ts',
  'internal-api/external-projects.ts',
  'internal-api/hidden-workspaces.ts',
  'internal-api/internal-api-error.ts',
  'internal-api/internal-api-url.ts',
  'internal-api/product-feedback.ts',
  'internal-api/profile-banner.ts',
  'internal-api/profile-media-optimize.ts',
  'internal-api/profile-media.ts',
  'internal-api/request-headers.ts',
  'internal-api/storage.ts',
  'internal-api/storage-export-links.ts',
  'internal-api/task-list-options.ts',
  'internal-api/task-media-filename.ts',
  'internal-api/task-project-mutations.ts',
  'internal-api/tasks-dashboard.ts',
  'internal-api/tasks.ts',
  'internal-api/user-config-types.ts',
  'internal-api/user-profile-types.ts',
  'internal-api/users.ts',
  'internal-api/workspaces.ts',
  'utils/playground-schema.ts',
  'utils/task-description-codec.ts',
  'utils/task-description-content.ts',
  'utils/text-helper.ts',
  'utils/yjs-helper.ts',
]);
const forbiddenPackages =
  /^(?:next(?:\/|$)|react-router(?:\/|$)|@cloudflare\/|cloudflare:|server-only$|@tuturuuu\/(?:realtime|supabase)(?:\/|$))/;

function packageName(specifier) {
  return specifier
    .split('/')
    .slice(0, specifier.startsWith('@') ? 2 : 1)
    .join('/');
}

function moduleSpecifiers(source, filename) {
  const ast = parse(source, {
    sourceType: 'unambiguous',
    plugins: ['typescript', 'jsx'],
    sourceFilename: filename,
  });
  const nodes = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    if (
      [
        'ImportDeclaration',
        'ExportNamedDeclaration',
        'ExportAllDeclaration',
      ].includes(node.type)
    ) {
      if (node.source) nodes.push(node.source);
    } else if (node.type === 'TSImportType') {
      nodes.push(node.argument);
    } else if (
      node.type === 'CallExpression' &&
      (node.callee.type === 'Import' ||
        (node.callee.type === 'Identifier' && node.callee.name === 'require'))
    ) {
      if (
        node.arguments.length !== 1 ||
        node.arguments[0].type !== 'StringLiteral'
      ) {
        throw new Error(`Nonliteral module reference in ${filename}`);
      }
      nodes.push(node.arguments[0]);
    }
    for (const value of Object.values(node)) visit(value);
  }
  visit(ast.program);
  return nodes;
}

function resolveSource(base) {
  const stem = base.replace(/\.js$/, '');
  for (const candidate of [
    base,
    `${stem}.ts`,
    `${stem}.tsx`,
    `${stem}/index.ts`,
  ]) {
    if (fs.existsSync(candidate) && fs.lstatSync(candidate).isFile())
      return candidate;
  }
  throw new Error(`Missing portable source: ${base}`);
}

function stagePortableSources({ repoRoot, destination, checkOnly = false }) {
  const sdk = path.join(repoRoot, 'packages/sdk');
  const sdkSource = path.join(sdk, 'src');
  const manifest = JSON.parse(
    fs.readFileSync(path.join(sdk, 'package.json'), 'utf8')
  );
  for (const name of embeddedPackages) {
    if (
      manifest.dependencies?.[name] ||
      manifest.optionalDependencies?.[name] ||
      manifest.peerDependencies?.[name]
    ) {
      throw new Error(`Public SDK must not install broad package ${name}`);
    }
  }
  const pending = [];
  const seen = new Set();
  const provenance = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Symlink in portable source');
      if (entry.isDirectory()) walk(file);
      // Test-only modules (specs and shared *-test-fixtures) never ship.
      else if (!/\.(test|spec|acceptance)\.|-test-fixtures\./.test(file))
        pending.push(file);
    }
  }
  walk(sdkSource);
  function outputPath(file) {
    if (file.startsWith(`${sdkSource}${path.sep}`))
      return path.join(destination, path.relative(sdkSource, file));
    const relative = path.relative(path.join(repoRoot, 'packages'), file);
    if (
      relative.startsWith('..') ||
      !/^(internal-api|utils)\/src\//.test(relative)
    ) {
      throw new Error(
        `Portable source escaped its public package: ${relative}`
      );
    }
    const portable = relative.replace('/src/', '/');
    if (!portableFiles.has(portable))
      throw new Error(`Unapproved portable source: ${portable}`);
    return path.join(destination, '_portable', portable);
  }
  while (pending.length) {
    const file = pending.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    if (seen.size > 2000)
      throw new Error('Portable source closure exceeds bound');
    const target = outputPath(file);
    const source = fs.readFileSync(file, 'utf8');
    const replacements = [];
    // Hoisted: CodeQL's JavaScript extractor misparses a regex literal
    // directly after `of` and skips the whole file.
    const isTypeScript = /\.[cm]?tsx?$/.test(file);
    for (const node of isTypeScript ? moduleSpecifiers(source, file) : []) {
      const specifier = node.value;
      const name = packageName(specifier);
      let dependency;
      if (specifier.startsWith('.')) {
        dependency = resolveSource(path.resolve(path.dirname(file), specifier));
      } else if (embeddedPackages.has(name)) {
        if (!portableEntries.has(specifier))
          throw new Error(`Unapproved public module: ${specifier}`);
        dependency = resolveSource(
          path.join(
            repoRoot,
            'packages',
            name.split('/')[1],
            'src',
            specifier.slice(name.length + 1)
          )
        );
      } else {
        if (
          forbiddenPackages.test(specifier) ||
          (!builtinModules.includes(specifier) &&
            !specifier.startsWith('node:') &&
            !manifest.dependencies?.[name])
        ) {
          throw new Error(
            `Undeclared or nonportable SDK dependency: ${specifier}`
          );
        }
        continue;
      }
      if (dependency === path.join(sdk, 'package.json')) {
        if (!checkOnly) {
          fs.mkdirSync(path.dirname(destination), { recursive: true });
          fs.copyFileSync(
            dependency,
            path.join(destination, '../package.json')
          );
        }
        continue;
      }
      pending.push(dependency);
      let relative = path
        .relative(path.dirname(target), outputPath(dependency))
        .split(path.sep)
        .join('/');
      if (!relative.startsWith('.')) relative = `./${relative}`;
      relative = relative.replace(/\.tsx?$/, '.js');
      replacements.push({
        start: node.start,
        end: node.end,
        text: JSON.stringify(relative),
      });
    }
    let rewritten = source;
    for (const edit of replacements.sort((a, b) => b.start - a.start)) {
      rewritten =
        rewritten.slice(0, edit.start) + edit.text + rewritten.slice(edit.end);
    }
    if (!checkOnly) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, rewritten);
    }
    if (!file.startsWith(`${sdkSource}${path.sep}`))
      provenance.push(path.relative(repoRoot, file));
  }
  return provenance.sort();
}

function build() {
  const sdk = path.resolve(__dirname, '..');
  const repoRoot = path.resolve(sdk, '../..');
  const cache = path.join(sdk, 'node_modules/.cache');
  fs.mkdirSync(cache, { recursive: true });
  const scratch = fs.mkdtempSync(path.join(cache, 'sdk-portable-'));
  try {
    const provenance = stagePortableSources({
      repoRoot,
      destination: path.join(scratch, 'src'),
    });
    fs.writeFileSync(
      path.join(scratch, 'tsconfig.json'),
      JSON.stringify({
        extends: path.join(sdk, 'tsconfig.build.json'),
        compilerOptions: {
          rootDir: path.join(scratch, 'src'),
          outDir: path.join(sdk, 'dist'),
          incremental: false,
          composite: false,
        },
        include: ['./src/**/*'],
        exclude: ['**/*.test.ts', '**/*.spec.ts'],
      })
    );
    fs.rmSync(path.join(sdk, 'dist'), { recursive: true, force: true });
    const result = spawnSync(
      'tsc',
      ['--project', path.join(scratch, 'tsconfig.json')],
      { cwd: sdk, stdio: 'inherit' }
    );
    if (result.error) throw result.error;
    if (result.status !== 0)
      throw new Error(`Portable SDK compilation failed (${result.status})`);
    fs.writeFileSync(
      path.join(sdk, 'dist/portable-sources.json'),
      `${JSON.stringify(provenance, null, 2)}\n`
    );
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

function checkPortableSources(repoRoot = path.resolve(__dirname, '../../..')) {
  return stagePortableSources({
    repoRoot,
    destination: path.join(repoRoot, 'packages/sdk/.portable-check/src'),
    checkOnly: true,
  });
}

if (require.main === module) {
  if (process.argv.includes('--check')) checkPortableSources();
  else build();
}
module.exports = {
  moduleSpecifiers,
  stagePortableSources,
  checkPortableSources,
};
