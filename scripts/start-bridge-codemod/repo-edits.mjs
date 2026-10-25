// Idempotent text edits to repository-owned files. Each edit returns the
// source unchanged when the record already exists and throws when its anchor
// is missing, so a refactored target fails loudly instead of being skipped.

/** The body of `export const <name> = {` up to its closing `}` line. */
function objectBlock(source, name, label) {
  const start = source.indexOf(`export const ${name} = {`);
  if (start === -1) throw new Error(`${label}: missing export ${name}`);
  const end = source.indexOf('\n}', start);
  if (end === -1) throw new Error(`${label}: unterminated export ${name}`);
  return { start, end, body: source.slice(start, end) };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

export const HELD_REASON = 'held for wave-2 cutover';

/** `productionPublicationPolicy.<app> = held` in tuturuuu.ci.ts. */
export function addHeldRecord(source, app, reason = HELD_REASON) {
  const label = 'tuturuuu.ci.ts';
  const block = objectBlock(source, 'productionPublicationPolicy', label);
  if (new RegExp(`\\n\\s*'?${escapeRegExp(app)}'?\\s*:`, 'u').test(block.body))
    return source;
  const key = /^[a-z][a-z0-9]*$/u.test(app) ? app : `'${app}'`;
  const line = `  ${key}: { state: 'held', reason: '${reason}' },\n`;
  return `${source.slice(0, block.end + 1)}${line}${source.slice(block.end + 1)}`;
}

/** Enables `<workflow>` in the `ci` map of tuturuuu.ci.ts. */
export function addCiWorkflow(source, workflow) {
  const label = 'tuturuuu.ci.ts';
  const block = objectBlock(source, 'ci', label);
  if (block.body.includes(`'${workflow}':`)) return source;
  return `${source.slice(0, block.end + 1)}  '${workflow}': true,\n${source.slice(block.end + 1)}`;
}

/** Protects the app's frontend surface in production-publication-policy.ts. */
export function addProtectedSurface(source, app) {
  const label = 'scripts/ci/production-publication-policy.ts';
  const start = source.indexOf('const protectedSurfaces = {');
  if (start === -1) throw new Error(`${label}: missing protectedSurfaces`);
  const end = source.indexOf('} as const;', start);
  if (end === -1) throw new Error(`${label}: unterminated protectedSurfaces`);
  const body = source.slice(start, end);
  if (new RegExp(`\\n\\s*'?${escapeRegExp(app)}'?\\s*:`, 'u').test(body))
    return source;
  const key = /^[a-z][a-z0-9]*$/u.test(app) ? app : `'${app}'`;
  return `${source.slice(0, end)}  ${key}: ['frontend'],\n${source.slice(end)}`;
}

/** Adds the app to the held-app fixture list of the policy regression. */
export function addPolicyTestApp(source, app) {
  const label = 'scripts/ci/production-publication-policy.test.js';
  const match = /const apps = \[([^\]]*)\];/u.exec(source);
  if (!match) throw new Error(`${label}: missing held app list`);
  const apps = match[1]
    .split(',')
    .map((item) => item.trim().replace(/^'|'$/gu, ''))
    .filter(Boolean);
  if (apps.includes(app)) return source;
  const list = [...apps, app].map((item) => `'${item}'`).join(', ');
  const replacement =
    list.length + 'const apps = [];'.length <= 80
      ? `const apps = [${list}];`
      : `const apps = [\n${[...apps, app].map((item) => `  '${item}',`).join('\n')}\n];`;
  return source.replace(match[0], replacement);
}

/** The override that keeps generated route trees out of Biome. */
export const ROUTE_TREE_OVERRIDE = `  "overrides": [
    {
      "includes": ["**/routeTree.gen.ts"],
      "formatter": { "enabled": false },
      "linter": { "enabled": false },
      "assist": { "enabled": false }
    }
  ]`;

/**
 * Keeps every generated \`routeTree.gen.ts\` out of Biome. TanStack's router
 * generator rewrites the file in its own format on each build, and
 * check:changed passes changed files to Biome explicitly, so the repository
 * carries one override for the generated file name rather than a per-app
 * \`files.includes\` exclusion each app must remember.
 */
export function addBiomeRouteTreeOverride(source) {
  if (source.includes('"**/routeTree.gen.ts"')) return source;
  if (/"overrides"\s*:/u.test(source))
    throw new Error('biome.json: add the route tree override to "overrides"');
  const end = source.lastIndexOf('}');
  if (end === -1) throw new Error('biome.json: missing root object');
  const body = source.slice(0, end).replace(/\s*$/u, '');
  return `${body},\n${ROUTE_TREE_OVERRIDE}\n}\n`;
}

/**
 * Adds native scripts without touching dependencies or existing scripts; a
 * conflicting existing script is reported, never overwritten.
 */
export function addPackageScripts(source, scripts) {
  const manifest = JSON.parse(source);
  const conflicts = [];
  const next = { ...(manifest.scripts ?? {}) };
  let changed = false;
  for (const [name, command] of Object.entries(scripts)) {
    if (next[name] === command) continue;
    if (name in next) {
      conflicts.push(
        `${name}: keeps "${next[name]}" (codemod wants "${command}")`
      );
      continue;
    }
    next[name] = command;
    changed = true;
  }
  if (!changed) return { source, conflicts };
  manifest.scripts = next;
  return { source: `${JSON.stringify(manifest, null, 2)}\n`, conflicts };
}

/** `bun add` invocations for missing or differently pinned dependencies. */
export function dependencyCommands(source, dependencies) {
  const manifest = JSON.parse(source);
  const commands = [];
  for (const [field, flag] of [
    ['dependencies', []],
    ['devDependencies', ['--dev']],
  ]) {
    const wanted = Object.entries(dependencies[field] ?? {}).filter(
      ([name, version]) =>
        (manifest.dependencies?.[name] ?? manifest.devDependencies?.[name]) !==
        version
    );
    if (wanted.length === 0) continue;
    commands.push([
      'bun',
      'add',
      ...flag,
      '--exact',
      ...wanted.map(([name, version]) => `${name}@${version}`),
    ]);
  }
  return commands;
}

/** Start-only sources the Next `tsconfig.json` leaves to tsconfig.cloudflare.json. */
export const START_ONLY_SOURCES = [
  'cloudflare',
  'src/routeTree.gen.ts',
  'src/router.tsx',
  'src/routes',
  'src/start-bridge',
  'src/start.ts',
  'vite.config.mts',
  'void.config.ts',
];

/** Adds missing `exclude` entries to a JSON tsconfig (comments unsupported). */
export function addTsconfigExcludes(source, entries = START_ONLY_SOURCES) {
  let config;
  try {
    config = JSON.parse(source);
  } catch {
    throw new Error('tsconfig.json: expected plain JSON (no comments)');
  }
  const exclude = Array.isArray(config.exclude) ? config.exclude : [];
  const missing = entries.filter((entry) => !exclude.includes(entry));
  if (missing.length === 0) return source;
  config.exclude = [...exclude, ...missing];
  return `${JSON.stringify(config, null, 2)}\n`;
}

const DEPLOY_JOB = '\n  Deploy-Production:\n';
const DEPLOY_IF = "    if: github.ref == 'refs/heads/production'\n";

/**
 * Gates `vercel-production-<app>.yaml` on the shared publication policy like
 * Shortener: an early `production-policy` job, and the deploy job runs only
 * when that job allows it. A held app therefore stops Vercel publication.
 */
export function addVercelProductionPolicyGate(source, app) {
  const label = `vercel-production-${app}.yaml`;
  if (source.includes('\n  production-policy:\n')) return source;
  const deploy = source.indexOf(DEPLOY_JOB);
  if (deploy === -1)
    throw new Error(`${label}: Deploy-Production job not found`);
  const ifAt = source.indexOf(DEPLOY_IF, deploy);
  if (ifAt !== deploy + DEPLOY_JOB.length)
    throw new Error(
      `${label}: expected the production-only if after Deploy-Production`
    );
  const gate = [
    '  production-policy:',
    '    name: Report production publication hold',
    "    if: github.ref == 'refs/heads/production'",
    '    runs-on: ubuntu-latest',
    '    outputs:',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub Actions expression
    '      allowed: ${{ steps.policy.outputs.allowed }}',
    '    steps:',
    '      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1',
    '      - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0',
    '        with:',
    '          node-version: 24',
    '      - id: policy',
    `        run: node scripts/ci/production-publication-policy.ts ${label} "$GITHUB_STEP_SUMMARY"`,
    '',
  ].join('\n');
  return [
    source.slice(0, deploy + 1),
    gate,
    '\n  Deploy-Production:\n',
    '    needs: [production-policy]\n',
    "    if: github.ref == 'refs/heads/production' && needs.production-policy.outputs.allowed == 'true'\n",
    source.slice(ifAt + DEPLOY_IF.length),
  ].join('');
}
