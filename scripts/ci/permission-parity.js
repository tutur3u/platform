#!/usr/bin/env node
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const {
  METHODS,
  callName,
  filesUnder,
  gateEvidence,
  sourceRepository,
  strings,
  walk,
} = require('./permission-parity-source');

function canonical(value) {
  return value
    .split('?')[0]
    .split('#')[0]
    .replace(/\$\{[^}]+\}|\$[A-Za-z_]\w*|\[[^\]]+\]|:[A-Za-z_]\w*/g, '*')
    .replace(/\/+$/, '');
}

function matches(pattern, route) {
  const a = canonical(pattern).split('/');
  const b = canonical(route).split('/');
  return (
    a.length === b.length &&
    a.every((part, i) => part === '*' || b[i] === '*' || part === b[i])
  );
}

function dartPaths(text) {
  const paths = [];
  // Strip comments using the string alternative first, preserving URL literals.
  const tokens =
    text.match(
      /'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|\/\/[^\n]*|\/\*[\s\S]*?\*\//g
    ) ?? [];
  const variables = new Map();
  for (const match of text.matchAll(
    /\b(?:const|final|String)\s+(\w+)\s*=\s*(['"])([^'"]+)\2/g
  )) {
    variables.set(match[1], match[3]);
  }
  for (const token of tokens) {
    if (token.startsWith('//') || token.startsWith('/*')) continue;
    let value = token.slice(1, -1);
    for (let i = 0; i < 4; i += 1) {
      value = value.replace(
        /\$(?:\{(\w+)\}|(\w+))/g,
        (original, a, b) => variables.get(a ?? b) ?? original
      );
    }
    const start = value.indexOf('/api/');
    if (start >= 0) paths.push(value.slice(start));
  }
  return [...new Set(paths)].sort();
}

function consumerFile(file) {
  return !/(?:\.test\.|\.spec\.|\.gen\.|\/start-bridge\/|\/runtime\/|\/migration\/|\/server\/|\/routes\/|\/api\/|\/legacy-api-routes\/|\/proxy\.|api-rewrites|api-patterns|api-registry|next-config|api-proxy)/.test(
    file
  );
}

function requestedPaths(module, file) {
  if (file.startsWith('packages/internal-api/')) return strings(module.ast);
  const values = [];
  walk(module.ast, (node) => {
    if (
      node.type === 'CallExpression' &&
      /^(?:fetch|request|get|post|put|patch|delete|getJson|getJsonList|postJson|putJson|patchJson|deleteJson|apiFetch|internalApiFetch|fetchJson)$/i.test(
        callName(node.callee)
      )
    ) {
      for (const argument of node.arguments) values.push(...strings(argument));
    }
  });
  return values;
}

function routePath(file) {
  const marker = file.includes('/src/legacy-api-routes/')
    ? '/src/legacy-api-routes/'
    : '/src/app/api/';
  const suffix = file.split(marker)[1];
  if (!suffix) return null;
  return (
    '/api/' +
    suffix
      .replace(/\/route\.[cm]?[jt]sx?$/, '')
      .split('/')
      .filter((segment) => !/^\(.*\)$/.test(segment))
      .join('/')
  );
}

function uiFeature(file) {
  return (file.split('/src/app/')[1] ?? '')
    .split('/')
    .filter(
      (part) =>
        !/^\(.*\)$/.test(part) && !part.startsWith('[') && part !== 'page.tsx'
    )
    .join('/');
}

function routeFeature(route) {
  return route
    .replace(/^\/api\/(?:v1\/)?workspaces\/[^/]+\/?/, '')
    .replace(/^finance\//, '');
}

function buildInventory(root) {
  const repository = sourceRepository(root);
  const appFiles = filesUnder(root, 'apps').filter(
    (file) =>
      !file.startsWith('apps/backend/') &&
      !file.startsWith('apps/tanstack-web/')
  );
  const satelliteApps = [
    ...new Set(
      appFiles
        .filter(
          (file) =>
            /^apps\/[^/]+\/next\.config\.[jt]s$/.test(file) &&
            /resolveTuturuuuWebAppUrl|WEB_APP_URL/.test(
              fs.readFileSync(path.join(root, file), 'utf8')
            )
        )
        .map((file) => file.split('/')[1])
    ),
  ].sort();
  const handlers = appFiles
    .filter((file) => /\/route\.[jt]s$/.test(file) && routePath(file))
    .map((file) => ({
      file,
      route: routePath(file),
      owner: file.split('/')[1],
    }));
  const sources = new Map();
  function recordSource(file) {
    if (!sources.has(file))
      sources.set(
        file,
        createHash('sha256')
          .update(fs.readFileSync(path.join(root, file)))
          .digest('hex')
      );
  }
  const consumers = new Map();
  function addConsumer(file, app, value) {
    if (!value.startsWith('/api/') || /[()|]|:\w|\*\*/.test(value)) return;
    recordSource(file);
    const route = canonical(value);
    if (!consumers.has(route)) consumers.set(route, new Map());
    consumers.get(route).set(`${app}:${file}`, { app, file });
  }
  for (const file of appFiles.filter(
    (file) => file.startsWith('apps/mobile/lib/') && file.endsWith('.dart')
  )) {
    for (const route of dartPaths(
      fs.readFileSync(path.join(root, file), 'utf8')
    ))
      addConsumer(file, 'mobile', route);
  }
  for (const app of satelliteApps) {
    const queue = appFiles.filter(
      (file) =>
        file.startsWith(`apps/${app}/src/`) &&
        /\.[jt]sx?$/.test(file) &&
        !file.includes('/api/') &&
        !file.includes('/legacy-api-routes/')
    );
    const seen = new Set();
    for (let i = 0; i < queue.length; i += 1) {
      const file = queue[i];
      if (seen.has(file) || !/\.[jt]sx?$/.test(file) || !consumerFile(file))
        continue;
      seen.add(file);
      const module = repository.load(file);
      for (const value of requestedPaths(module, file))
        addConsumer(file, app, value);
      for (const dependency of module.dependencies)
        if (!seen.has(dependency)) queue.push(dependency);
    }
  }
  const ui = appFiles
    .filter(
      (file) =>
        file.endsWith('/page.tsx') &&
        file.includes('/src/app/') &&
        !file.includes('/api/')
    )
    .map((file) => {
      const evidence = gateEvidence([
        { file, node: repository.load(file).ast },
      ]);
      return {
        file,
        feature: uiFeature(file),
        permissions: evidence.permissions,
        rules: evidence.permissionRules,
      };
    })
    .filter((entry) => entry.feature && entry.permissions.length);
  const routes = new Map();
  const unresolved = [];
  for (const [requested, sources] of [...consumers.entries()].sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    const candidates = handlers.filter(
      (handler) =>
        !handler.route.includes('[...') && matches(requested, handler.route)
    );
    if (!candidates.length) {
      unresolved.push({
        route: requested,
        consumers: [...sources.values()].sort((a, b) =>
          a.file.localeCompare(b.file)
        ),
      });
      continue;
    }
    for (const handler of candidates) {
      const module = repository.load(handler.file);
      if (![...module.exports.keys()].some((name) => METHODS.has(name))) {
        unresolved.push({
          route: requested,
          handler: handler.file,
          consumers: [...sources.values()],
        });
      }
      for (const method of [...module.exports.keys()]
        .filter((name) => METHODS.has(name))
        .sort()) {
        const key = `${handler.file}:${method}`;
        if (!routes.has(key)) {
          const nodes = repository.reachable(handler.file, method);
          recordSource(handler.file);
          for (const node of nodes) recordSource(node.file);
          const evidence = gateEvidence(nodes);
          const feature = routeFeature(handler.route);
          const matchingUi = ui.filter(
            (entry) =>
              feature === entry.feature ||
              feature.startsWith(`${entry.feature}/`)
          );
          const longest = Math.max(
            0,
            ...matchingUi.map((entry) => entry.feature.length)
          );
          const uiSources = matchingUi.filter(
            (entry) => entry.feature.length === longest
          );
          for (const entry of uiSources) recordSource(entry.file);
          routes.set(key, {
            route: handler.route,
            method,
            handler: handler.file,
            owner: handler.owner,
            workspace: /\/workspaces\/\[[^/]+\](?:\/|$)/.test(handler.route),
            consumers: [],
            ...evidence,
            uiPermissions: [
              ...new Set(uiSources.flatMap((entry) => entry.permissions)),
            ].sort(),
            uiPermissionRules: [
              ...new Map(
                uiSources
                  .flatMap((entry) => entry.rules)
                  .map((rule) => [JSON.stringify(rule), rule])
              ).values(),
            ].sort((a, b) =>
              JSON.stringify(a).localeCompare(JSON.stringify(b))
            ),
            uiSources: uiSources.map((entry) => entry.file).sort(),
          });
        }
        const entry = routes.get(key);
        entry.consumers = [
          ...new Map(
            [...entry.consumers, ...sources.values()].map((consumer) => [
              `${consumer.app}:${consumer.file}`,
              consumer,
            ])
          ).values(),
        ].sort((a, b) =>
          `${a.app}:${a.file}`.localeCompare(`${b.app}:${b.file}`)
        );
      }
    }
  }
  return {
    schemaVersion: 1,
    sources: Object.fromEntries(
      [...sources].sort(([a], [b]) => a.localeCompare(b))
    ),
    satelliteApps,
    routes: [...routes.values()].sort((a, b) =>
      `${a.route}:${a.owner}:${a.method}`.localeCompare(
        `${b.route}:${b.owner}:${b.method}`
      )
    ),
    unresolved,
  };
}

function checkInventory(inventory) {
  const failures = inventory.unresolved.map(
    (entry) => `unresolved consumed route: ${entry.route}`
  );
  for (const entry of inventory.routes) {
    if (!entry.workspace) continue;
    const label = `${entry.method} ${entry.route} (${entry.owner})`;
    if (!entry.authHelpers.length)
      failures.push(`${label}: no verified workspace membership gate`);
    if (!entry.permissions.length)
      failures.push(`${label}: no named permission denial gate`);
    if (!entry.uiPermissions.length)
      failures.push(`${label}: UI permission policy needs review`);
    else if (
      JSON.stringify(entry.uiPermissionRules) !==
      JSON.stringify(entry.permissionRules)
    ) {
      failures.push(
        label +
          ': API does not enforce the UI permission set: ' +
          entry.uiPermissions.join(', ')
      );
    }
  }
  return failures;
}

function serialize(inventory) {
  return `${JSON.stringify(inventory, null, 2)}\n`;
}

if (require.main === module) {
  const root = path.resolve(__dirname, '../..');
  const inventory = buildInventory(root);
  const snapshot = path.join(__dirname, 'permission-parity.snapshot.json');
  if (process.argv.includes('--write')) {
    const formatted = execFileSync(
      path.join(root, 'node_modules/.bin/biome'),
      [
        'format',
        '--stdin-file-path=scripts/ci/permission-parity.snapshot.json',
      ],
      {
        input: serialize(inventory),
        encoding: 'utf8',
        cwd: root,
        maxBuffer: 8 * 1024 * 1024,
      }
    );
    fs.writeFileSync(snapshot, formatted);
  }
  const failures = checkInventory(inventory);
  console.log(
    JSON.stringify({
      handlers: inventory.routes.length,
      unresolved: inventory.unresolved.length,
      failures: failures.length,
    })
  );
  for (const failure of failures.slice(0, 20)) console.error(failure);
  if (failures.length > 20)
    console.error(
      'Use checkInventory(buildInventory(root)) for the complete diagnostics.'
    );
  if (
    !process.argv.includes('--write') &&
    serialize(inventory) !==
      serialize(JSON.parse(fs.readFileSync(snapshot, 'utf8')))
  ) {
    console.error(
      'Permission snapshot drift: run node scripts/ci/permission-parity.js --write and review the diff.'
    );
    process.exitCode = 1;
  }
  if (failures.length) process.exitCode = 1;
}

module.exports = {
  buildInventory,
  canonical,
  checkInventory,
  dartPaths,
  matches,
  serialize,
};
