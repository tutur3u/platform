export type TaskLinkKind =
  | 'pull_request'
  | 'commit'
  | 'ci_run'
  | 'issue'
  | 'doc'
  | 'url';
export type TaskLinkProvider = 'github' | 'web';

export type InferredLink = {
  kind: TaskLinkKind;
  provider: TaskLinkProvider;
  externalId: string | null;
};

const GITHUB_PATH =
  /^\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/(pull|issues|commit|actions\/runs)\/([A-Za-z0-9]+)\/?$/u;

/**
 * Classifies a link. github.com pull, commit, Actions run and issue URLs get
 * their kind and a stable external id; everything else is a plain web URL.
 */
export function inferTaskLink(rawUrl: string): InferredLink {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { kind: 'url', provider: 'web', externalId: null };
  }
  if (
    url.protocol !== 'https:' ||
    url.hostname.toLowerCase() !== 'github.com'
  ) {
    return { kind: 'url', provider: 'web', externalId: null };
  }
  const match = GITHUB_PATH.exec(url.pathname);
  if (!match) return { kind: 'url', provider: 'web', externalId: null };
  const [, owner, repo, segment, ref] = match as unknown as [
    string,
    string,
    string,
    string,
    string,
  ];
  const repoName = `${owner}/${repo}`;
  if (segment === 'pull' && /^\d+$/u.test(ref)) {
    return {
      kind: 'pull_request',
      provider: 'github',
      externalId: `${repoName}#${ref}`,
    };
  }
  if (segment === 'issues' && /^\d+$/u.test(ref)) {
    return {
      kind: 'issue',
      provider: 'github',
      externalId: `${repoName}#${ref}`,
    };
  }
  if (segment === 'commit' && /^[0-9a-f]{7,40}$/iu.test(ref)) {
    return {
      kind: 'commit',
      provider: 'github',
      externalId: `${repoName}@${ref.toLowerCase()}`,
    };
  }
  if (segment === 'actions/runs' && /^\d+$/u.test(ref)) {
    return {
      kind: 'ci_run',
      provider: 'github',
      externalId: `${repoName}/runs/${ref}`,
    };
  }
  return { kind: 'url', provider: 'web', externalId: null };
}
