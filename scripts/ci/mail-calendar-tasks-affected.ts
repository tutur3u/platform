import type { WorkflowDecisionInput } from '../../tuturuuu.ts';
import { buildWorkspaceDependencyClosure } from './workspace-dependency-closure.ts';

const targets = {
  mail: ['@tuturuuu/mail'],
  tasks: ['@tuturuuu/tasks'],
  web: ['@tuturuuu/web'],
  calendar: [
    '@tuturuuu/calendar',
    '@tuturuuu/web',
    '@tuturuuu/tasks',
    '@tuturuuu/tasks-ui',
    '@tuturuuu/infrastructure',
  ],
};

// Calendar qualification includes the Web/Tasks consumers and restored artifact.
export function getMailCalendarTasksAffected({
  changedFiles,
  eventName,
  workspaceManifests = [],
}: Pick<
  WorkflowDecisionInput,
  'changedFiles' | 'eventName' | 'workspaceManifests'
>): Record<string, boolean> {
  const all = Object.fromEntries(
    Object.keys(targets).map((key) => [key, true])
  );
  if (eventName === 'workflow_dispatch' || !changedFiles?.length) return all;

  const manifests = new Map(
    workspaceManifests.map((manifest) => [manifest.name, manifest])
  );
  const paths = new Map(
    workspaceManifests.map((manifest) => [manifest.path, manifest.name])
  );
  const changedWorkspaces = new Set<string>();
  for (const file of changedFiles) {
    const normalized = file.replace(/\\/g, '/').replace(/^\.\//, '');
    if (
      /^plugins\/tuturuuu\/skills\/.*\.md$/.test(normalized) ||
      /^apps\/docs\/.*\.(md|mdx)$/.test(normalized)
    )
      continue;
    const workspace = /^(apps|packages)\/[^/]+(?:\/|$)/.exec(normalized);
    // All root inputs, scripts, patches and shared actions invalidate every job.
    if (!workspace) return all;
    const name = paths.get(workspace[0].replace(/\/$/, ''));
    // Includes deleted, renamed, unknown or unreadable manifests.
    if (!name) return all;
    changedWorkspaces.add(name);
  }

  const affected: Record<string, boolean> = {};
  for (const [target, roots] of Object.entries(targets)) {
    const closure = new Set<string>();
    for (const root of roots) {
      const dependencies = buildWorkspaceDependencyClosure(
        root,
        workspaceManifests
      );
      if (!dependencies) return all;
      for (const name of dependencies) {
        const manifest = manifests.get(name);
        if (
          !manifest ||
          manifest.dependencies.some((dep) => !manifests.has(dep))
        ) {
          return all;
        }
        closure.add(name);
      }
    }
    affected[target] = [...changedWorkspaces].some((name) => closure.has(name));
  }
  return affected;
}
