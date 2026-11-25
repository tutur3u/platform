// Production planner selection follows the workspace dependency graph: a
// shared package change selects every production app that consumes it,
// directly, transitively, or through an undeclared relative-import edge.
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  cloudflareProductionTargets,
  getWorkflowDecision,
} from '../../tuturuuu.ts';
import { buildWorkspaceDependencyClosure } from './workspace-dependency-closure.ts';
import {
  readExtraWorkspaceEdges,
  readWorkspaceManifests,
} from './workflow-config-core.ts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
const workspaceManifests = readWorkspaceManifests(repoRoot);
const extraEdges = readExtraWorkspaceEdges(repoRoot);

function selectedApps(changedFiles, edges = extraEdges) {
  return cloudflareProductionTargets
    .filter(
      ({ productionWorkflow }) =>
        getWorkflowDecision({
          changedFiles,
          eventName: 'push',
          extraEdges: edges,
          workflowName: productionWorkflow,
          workspaceManifests,
        }).shouldRun
    )
    .map(({ app }) => app);
}

test('a satellite sidebar change selects every native app that renders it', () => {
  const selected = selectedApps([
    'packages/satellite/src/components/sidebar-structure.tsx',
  ]);
  for (const app of ['mail', 'calendar', 'apps', 'tasks'])
    assert.ok(selected.includes(app), `${app} must republish`);
});

test('a packages/ui sidebar change selects mail, calendar and apps', () => {
  const selected = selectedApps([
    'packages/ui/src/components/ui/custom/structure.tsx',
  ]);
  for (const app of ['mail', 'calendar', 'apps', 'tasks', 'meet'])
    assert.ok(selected.includes(app), `${app} must republish`);
});

test('every package in a target closure selects that target', () => {
  for (const target of cloudflareProductionTargets) {
    if (!('packageName' in target)) continue;
    const closure = buildWorkspaceDependencyClosure(
      target.packageName,
      workspaceManifests
    );
    assert.ok(closure, `${target.app} manifest must resolve`);
    for (const manifest of workspaceManifests) {
      if (!closure.has(manifest.name) || !manifest.path.startsWith('packages/'))
        continue;
      const decision = getWorkflowDecision({
        changedFiles: [`${manifest.path}/src/selection-probe.ts`],
        eventName: 'push',
        extraEdges,
        workflowName: target.productionWorkflow,
        workspaceManifests,
      });
      assert.equal(
        decision.shouldRun,
        true,
        `${manifest.path} must select ${target.app}`
      );
    }
  }
});

test('an undeclared relative-import edge reaches consumers of the importer', () => {
  assert.ok(extraEdges, 'extra edges must load from the repository');
  assert.deepEqual(extraEdges['apps/calendar/messages/'], ['packages/ui']);
  const changed = ['apps/calendar/messages/en.json'];
  // packages/ui imports Calendar messages, so every packages/ui consumer
  // ships the change, not only Calendar.
  const selected = selectedApps(changed);
  for (const app of ['calendar', 'mail', 'apps'])
    assert.ok(selected.includes(app), `${app} must republish`);
  assert.deepEqual(selectedApps(changed, null), ['calendar']);
});

test('an unrelated package change leaves consumers unselected', () => {
  const selected = selectedApps(['packages/whiteboard/src/selection-probe.ts']);
  assert.ok(!selected.includes('mail'));
  assert.ok(!selected.includes('apps'));
});
