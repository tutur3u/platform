import type { WorkflowDecisionInput } from '../../tuturuuu.ts';

export function getMobileTestsAffected({
  changedFiles,
  eventName,
  workspaceManifests = [],
}: Pick<
  WorkflowDecisionInput,
  'changedFiles' | 'eventName' | 'workspaceManifests'
>): { tests: boolean } {
  if (eventName !== 'pull_request' || !changedFiles?.length) {
    return { tests: true };
  }
  const files = changedFiles.map((file) =>
    file.replace(/\\/g, '/').replace(/^\.\//, '')
  );
  if (!files.includes('bun.lock')) return { tests: true };

  const nodeWorkspaces = new Set(
    workspaceManifests.map((manifest) => manifest.path)
  );
  const unrelated = files.every((file) => {
    if (file.split('/').includes('..')) return false;
    if (
      /^(apps\/mobile|apps\/meet-realtime|packages\/realtime)(\/|$)/.test(
        file
      ) ||
      /\.(dart|arb)$|(^|\/)pubspec\.(yaml|lock)$/.test(file)
    ) {
      return false;
    }
    if (file === 'bun.lock' || file === 'package.json') return true;
    if (
      /^[^/]+\.mdx?$/.test(file) ||
      /^(docs\/|plugins\/tuturuuu\/skills\/).*\.mdx?$/.test(file)
    ) {
      return true;
    }
    const workspace = /^(apps\/[^/]+|packages\/[^/]+)\//.exec(file)?.[1];
    return workspace !== undefined && nodeWorkspaces.has(workspace);
  });
  return { tests: !unrelated };
}

const platforms = new Map([
  ['mobile-build-ios.yaml', 'ios'],
  ['mobile-build-macos.yaml', 'macos'],
  ['mobile-build-linux.yaml', 'linux'],
  ['mobile-build-windows.yaml', 'windows'],
]);

export function getMobileBuildDecision({
  changedFiles,
  eventName,
  workflowName,
}: WorkflowDecisionInput) {
  const platform = platforms.get(workflowName);
  if (!platform || eventName !== 'pull_request') return undefined;

  const files = changedFiles?.map((file) =>
    file.replace(/\\/g, '/').replace(/^\.\//, '')
  );
  if (!files?.length) return undefined;

  const matchedPaths = files.filter((file) => {
    if (file.startsWith(`apps/mobile/${platform}/`)) return true;
    // Only these known portable or other-platform paths can omit a PR build.
    if (/^apps\/mobile\/(lib|test|integration_test|assets|docs)\//.test(file)) {
      return false;
    }
    if (/^apps\/mobile\/(android|ios|macos|linux|windows|web)\//.test(file)) {
      return false;
    }
    if (/^apps\/mobile\/[^/]+\.(md|mdx)$/.test(file)) return false;
    return true;
  });

  return {
    matchedPaths,
    reason: matchedPaths.length
      ? `${platform} native or shared build inputs changed`
      : `Android covers portable mobile PR changes; ${platform} builds on main`,
    shouldRun: matchedPaths.length > 0,
  };
}
