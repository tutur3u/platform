import type { WorkflowDecisionInput } from '../../tuturuuu.ts';

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
