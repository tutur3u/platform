import { type GitGuardConfig, globMatch } from './git-guard-config';

const ZERO = /^0+$/u;

export interface PushUpdate {
  localRef: string;
  localSha: string;
  remoteRef: string;
  remoteSha: string;
}

export type PushDecisionCode =
  | 'ff-allowed'
  | 'allowlisted'
  | 'existing-allowed'
  | 'delete-allowed'
  | 'tag-allowed'
  | 'new-branch'
  | 'existing-branch'
  | 'non-ff'
  | 'protected-delete'
  | 'protected-create'
  | 'existing-only'
  | 'non-branch-ref';

export interface PushDecision {
  update: PushUpdate;
  ref: string;
  allowed: boolean;
  code: PushDecisionCode;
  /** Whether a logged one-shot override may allow this refusal. */
  overridable: boolean;
}

export function parsePrePushInput(input: string): PushUpdate[] {
  return input
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [localRef = '', localSha = '', remoteRef = '', remoteSha = ''] =
        line.split(/\s+/u);
      return { localRef, localSha, remoteRef, remoteSha };
    });
}

/**
 * Decide each ref update of a push to a guarded repository. `isAncestor`
 * must answer whether `older` is an ancestor of `newer` locally; an unknown
 * object counts as not an ancestor, so a stale clone is refused (fetch first)
 * rather than allowed to rewrite history.
 */
export function evaluatePush(
  config: GitGuardConfig,
  updates: PushUpdate[],
  isAncestor: (older: string, newer: string) => boolean
): PushDecision[] {
  return updates.map((update) => decide(config, update, isAncestor));
}

function decide(
  config: GitGuardConfig,
  update: PushUpdate,
  isAncestor: (older: string, newer: string) => boolean
): PushDecision {
  const { remoteRef } = update;
  const result = (
    ref: string,
    code: PushDecisionCode,
    allowed: boolean,
    overridable = !allowed
  ): PushDecision => ({ update, ref, code, allowed, overridable });

  if (remoteRef.startsWith('refs/tags/'))
    return result(remoteRef.slice(10), 'tag-allowed', true);
  if (!remoteRef.startsWith('refs/heads/'))
    return result(remoteRef, 'non-branch-ref', false);

  const branch = remoteRef.slice(11);
  const deleting = ZERO.test(update.localSha);
  const creating = ZERO.test(update.remoteSha);

  if (config.ffOnlyBranches.includes(branch)) {
    // Protected history: no override may delete, create or rewrite it.
    if (deleting) return result(branch, 'protected-delete', false, false);
    if (creating) return result(branch, 'protected-create', false, false);
    return isAncestor(update.remoteSha, update.localSha)
      ? result(branch, 'ff-allowed', true)
      : result(branch, 'non-ff', false, false);
  }
  if (deleting) return result(branch, 'delete-allowed', true);
  if (config.allowBranches.some((pattern) => globMatch(pattern, branch)))
    return result(branch, 'allowlisted', true);
  if (config.existingOnlyPrefixes.some((prefix) => branch.startsWith(prefix)))
    return creating
      ? result(branch, 'existing-only', false)
      : result(branch, 'existing-allowed', true);
  if (creating) return result(branch, 'new-branch', false);
  return config.existingBranches === 'allow'
    ? result(branch, 'existing-allowed', true)
    : result(branch, 'existing-branch', false);
}

const reasons: Record<PushDecisionCode, string> = {
  'ff-allowed': 'fast-forward',
  allowlisted: 'allowlisted in ttr git guard config',
  'existing-allowed': 'updates an existing allowed branch',
  'delete-allowed': 'deletes a non-protected branch',
  'tag-allowed': 'tag push',
  'new-branch': 'would create a NEW remote branch',
  'existing-branch': 'pushes a non-main branch',
  'non-ff': 'is not a fast-forward (fetch, rebase onto the remote, retry)',
  'protected-delete': 'would delete a protected branch',
  'protected-create': 'would create a protected branch',
  'existing-only': 'may only update an existing release branch',
  'non-branch-ref': 'pushes a ref outside refs/heads and refs/tags',
};

export const describeDecision = (decision: PushDecision) =>
  reasons[decision.code];

export function refusalMessage(
  repo: string,
  refused: PushDecision[],
  machine: string
) {
  const lines = refused.map(
    (decision) => `  - ${decision.ref}: ${describeDecision(decision)}`
  );
  const overridable = refused.every((decision) => decision.overridable);
  return [
    `ttr git guard: push to ${repo} refused on ${machine}.`,
    ...lines,
    '',
    'This repository takes no pull requests and no new remote branches.',
    'Use the direct-to-main flow: review locally, rebase onto origin/main,',
    'commit as the configured identity with a DCO sign-off, then',
    '`git push origin HEAD:main` (fast-forward only) and `bun git-sync`.',
    overridable
      ? 'A real exception needs an explicit, logged, single-use override:\n  ttr git guard allow-once --kind push --repo ' +
        `${repo} --ref <branch> --reason "<why>" --approved-by <who>`
      : 'Protected-branch rewrites and deletions cannot be overridden here.',
    '',
  ].join('\n');
}
