const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');

function formatRoute(source) {
  const result = spawnSync(
    path.join(root, 'node_modules', '.bin', 'oxfmt'),
    ['--stdin-filepath=route.ts'],
    { cwd: root, encoding: 'utf8', input: source }
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout;
}

const workspaceGroups = [
  'api-keys',
  'encryption',
  'external-apps',
  'group-tags',
  'integrations',
  'posts',
  'roles',
  'settings',
  'time-tracking',
  'topic-announcements',
  'user-profile-links',
  'wallets',
  'whiteboards',
];

function groupWorkspaceWrappers(wrappers, targetDir, marker, importPath) {
  const groups = new Map();
  const individual = [];
  for (const wrapper of wrappers) {
    const [version, scope, workspace, group, ...tail] =
      wrapper.relativeRouteFile.split('/');
    if (
      version !== 'v1' ||
      scope !== 'workspaces' ||
      workspace !== '[wsId]' ||
      !workspaceGroups.includes(group) ||
      tail.length === 0
    ) {
      individual.push(wrapper);
      continue;
    }
    const base = [version, scope, workspace, group].join('/');
    const entries = groups.get(base) ?? [];
    entries.push({ ...wrapper, segments: tail.slice(0, -1) });
    groups.set(base, entries);
  }

  for (const [base, entries] of groups) {
    const optional = entries.some(({ segments }) => segments.length === 0);
    const segment = optional ? '[[...segments]]' : '[...segments]';
    const relativeRouteFile = `${base}/${segment}/route.ts`;
    const imports = entries.map(
      (entry, index) =>
        `import * as route${index} from '${importPath(entry.relativeRouteFile)}';`
    );
    const definitions = entries.map(({ segments, methods }, index) => {
      if (segments.some((part) => part.includes('...'))) {
        throw new Error(`Nested catch-all in ${base}`);
      }
      const handlers = methods.map(
        (method) => `${method}: route${index}.${method}`
      );
      return `  [${JSON.stringify(segments)}, { ${handlers.join(', ')} }],`;
    });

    individual.push({
      relativeRouteFile,
      targetPath: path.join(targetDir, relativeRouteFile),
      content: formatRoute(
        [
          marker,
          '',
          ...imports,
          "import { createWorkspaceRouteHandlers } from '@/legacy-api-routes/workspace-route-group';",
          '',
          'export const { GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS } =',
          '  createWorkspaceRouteHandlers([',
          ...definitions.map((line) => `  ${line}`),
          '  ]);',
          '',
        ].join('\n')
      ),
    });
  }
  return individual;
}

module.exports = { groupWorkspaceWrappers };
