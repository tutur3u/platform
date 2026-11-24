import { execFile } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { GithubImportIssue } from '@tuturuuu/internal-api/task-collaboration';

export const GITHUB_PAGE_SIZE = 25;
const CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_RATE_WAIT_MS = 15 * 60 * 1000;

const ISSUE_FIELDS = `
  number url title body state stateReason createdAt updatedAt closedAt
  author { login }
  labels(first: 50) { nodes { name } }
  assignees(first: 20) { nodes { login } }
  milestone { title }
  parent { url }
  subIssues(first: 50) { nodes { url } }
  comments(first: 50) { totalCount nodes { url body createdAt author { login } } }
  closedByPullRequestsReferences(first: 20, includeClosedPrs: true) {
    nodes { url number state merged title }
  }
  timelineItems(first: 100, itemTypes: [LABELED_EVENT, UNLABELED_EVENT, CLOSED_EVENT, REOPENED_EVENT, MILESTONED_EVENT, REFERENCED_EVENT, CROSS_REFERENCED_EVENT]) {
    nodes {
      __typename
      ... on LabeledEvent { createdAt label { name } actor { login } }
      ... on UnlabeledEvent { createdAt label { name } actor { login } }
      ... on ClosedEvent { createdAt actor { login } }
      ... on ReopenedEvent { createdAt actor { login } }
      ... on MilestonedEvent { createdAt milestoneTitle actor { login } }
      ... on ReferencedEvent { createdAt commit { oid url } }
      ... on CrossReferencedEvent {
        createdAt
        source { __typename ... on PullRequest { number url state merged title } }
      }
    }
  }
`;

const QUERY = `
query($owner: String!, $name: String!, $first: Int!, $after: String, $states: [IssueState!]) {
  rateLimit { cost remaining resetAt }
  repository(owner: $owner, name: $name) {
    issues(first: $first, after: $after, states: $states, orderBy: { field: CREATED_AT, direction: ASC }) {
      pageInfo { hasNextPage endCursor }
      nodes { ${ISSUE_FIELDS} }
    }
  }
}`;

type Node = Record<string, any>;

export type GithubSourceOptions = {
  repo: string;
  state: 'all' | 'open' | 'closed';
  /** Called with `gh` arguments; returns stdout. Replaced in tests. */
  runGh?: (args: string[]) => Promise<string>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  cacheDir?: string;
  refresh?: boolean;
  /** Stop paging once this many issues were read. */
  maxIssues?: number;
  onProgress?: (message: string) => void;
};

export function parseRepo(value: string) {
  const match = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/u.exec(value);
  if (!match)
    throw new Error('Use --repo owner/name, for example tutur3u/platform.');
  return { owner: match[1]!, name: match[2]! };
}

function defaultRunGh(args: string[]) {
  return new Promise<string>((resolve, reject) => {
    execFile(
      'gh',
      args,
      { maxBuffer: 64 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          const text = `${stderr || ''}${stdout || ''}${error.message}`;
          reject(Object.assign(new Error(text.trim()), { ghOutput: text }));
          return;
        }
        resolve(stdout);
      }
    );
  });
}

export function isRateLimitError(error: unknown) {
  const text = String((error as { ghOutput?: string })?.ghOutput ?? error);
  return /rate limit|secondary rate|abuse detection|retry-after|HTTP 403|HTTP 429/iu.test(
    text
  );
}

function cacheKey(repo: string, state: string, after: string | null) {
  return createHash('sha256')
    .update(`${repo}|${state}|${after ?? ''}|v1`)
    .digest('hex')
    .slice(0, 32);
}

/**
 * The cache directory is private to the user: created 0700, never a symlink
 * (a planted link could redirect cache writes), and re-chmodded on use.
 */
export async function ensureCacheDir(dir: string) {
  const existing = await lstat(dir).catch(() => null);
  if (existing?.isSymbolicLink()) {
    throw new Error(`Refusing to use a symlinked cache directory: ${dir}`);
  }
  if (existing && !existing.isDirectory()) {
    throw new Error(`The cache path is not a directory: ${dir}`);
  }
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const created = await lstat(dir);
  if (created.isSymbolicLink() || !created.isDirectory()) {
    throw new Error(`Refusing to use a symlinked cache directory: ${dir}`);
  }
  await chmod(dir, 0o700);
}

async function readCache(file: string, now: number) {
  try {
    // A symlink at a cache path is never followed.
    const info = await lstat(file);
    if (!info.isFile() || now - info.mtimeMs > CACHE_TTL_MS) return null;
    return JSON.parse(await readFile(file, 'utf8')) as {
      nodes: Node[];
      hasNextPage: boolean;
      endCursor: string | null;
    };
  } catch {
    return null;
  }
}

/** Writes through a temp file and a rename, so a reader never sees half a page. */
async function writeCache(file: string, value: unknown) {
  const temp = `${file}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  try {
    await writeFile(temp, JSON.stringify(value), { mode: 0o600, flag: 'wx' });
    await chmod(temp, 0o600);
    await rename(temp, file);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}

/**
 * Reads issues through the caller's own `gh` authentication, 25 per page.
 * Pages are cached on disk; rate limits back off instead of failing. No token
 * is read or forwarded: only issue data leaves this module.
 */
export async function fetchGithubIssues(
  options: GithubSourceOptions
): Promise<Node[]> {
  const { owner, name } = parseRepo(options.repo);
  const runGh = options.runGh ?? defaultRunGh;
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = options.now ?? Date.now;
  const dir =
    options.cacheDir ??
    process.env.TTR_GITHUB_IMPORT_CACHE ??
    join(homedir(), '.cache', 'tuturuuu', 'github-import');
  await ensureCacheDir(dir);

  const states = options.state === 'all' ? [] : [options.state.toUpperCase()];
  const issues: Node[] = [];
  let after: string | null = null;
  let page = 0;

  for (;;) {
    page += 1;
    const file = join(
      dir,
      `${cacheKey(options.repo, options.state, after)}.json`
    );
    let result = options.refresh ? null : await readCache(file, now());
    if (result) {
      options.onProgress?.(`page ${page}: cache`);
    } else {
      let attempt = 0;
      for (;;) {
        attempt += 1;
        const args = [
          'api',
          'graphql',
          '-f',
          `query=${QUERY}`,
          '-f',
          `owner=${owner}`,
          '-f',
          `name=${name}`,
          '-F',
          `first=${GITHUB_PAGE_SIZE}`,
          ...(after ? ['-f', `after=${after}`] : []),
          ...states.flatMap((state) => ['-f', `states[]=${state}`]),
        ];
        try {
          const parsed = JSON.parse(await runGh(args)) as Node;
          if (parsed.errors?.length)
            throw new Error(JSON.stringify(parsed.errors));
          const connection = parsed.data.repository.issues;
          result = {
            nodes: connection.nodes,
            hasNextPage: connection.pageInfo.hasNextPage,
            endCursor: connection.pageInfo.endCursor,
          };
          await writeCache(file, result);
          const limit = parsed.data.rateLimit;
          if (limit && limit.remaining <= limit.cost * 2) {
            const wait = Math.min(
              Math.max(Date.parse(limit.resetAt) - now(), 1000),
              MAX_RATE_WAIT_MS
            );
            options.onProgress?.(
              `rate limit low, waiting ${Math.ceil(wait / 1000)}s`
            );
            await sleep(wait);
          }
          options.onProgress?.(`page ${page}: fetched`);
          break;
        } catch (error) {
          if (attempt >= MAX_ATTEMPTS || !isRateLimitError(error)) throw error;
          const wait = Math.min(2 ** attempt * 1000, MAX_RATE_WAIT_MS);
          options.onProgress?.(`rate limited, retrying in ${wait / 1000}s`);
          await sleep(wait);
        }
      }
    }
    issues.push(...result.nodes);
    if (!result.hasNextPage || !result.endCursor) break;
    if (options.maxIssues && issues.length >= options.maxIssues) break;
    after = result.endCursor;
  }
  return issues;
}

const lower = (value: unknown) =>
  typeof value === 'string' ? value.toLowerCase() : null;

/** True when a github.com URL points into `repo` (owner/name, any case). */
function urlInRepo(url: unknown, repo: string) {
  const match = /^https:\/\/github\.com\/([^/]+\/[^/]+)\//u.exec(String(url));
  return !!match && match[1]!.toLowerCase() === repo.toLowerCase();
}

/**
 * Converts a GraphQL issue node (live or from an export) to the import shape.
 * Links into other repositories are dropped, with a warning, because the API
 * only accepts links inside the issue's own repository.
 */
export function normalizeGithubIssue(
  node: Node,
  repo: string,
  warn: (message: string) => void = () => undefined
): GithubImportIssue {
  const keep = (url: unknown, label: string) => {
    if (urlInRepo(url, repo)) return true;
    warn(`#${node.number}: dropped ${label} outside ${repo}: ${String(url)}`);
    return false;
  };
  const timeline: Node[] = node.timelineItems?.nodes ?? [];
  const prs = new Map<string, GithubImportIssue['linked_prs'][number]>();
  const addPr = (source: Node | null | undefined) => {
    if (!source?.url || !String(source.url).includes('/pull/')) return;
    if (!keep(source.url, 'pull request')) return;
    prs.set(source.url, {
      url: source.url,
      number: source.number,
      state: lower(source.state),
      merged: Boolean(source.merged),
      title: source.title ?? null,
    });
  };
  const commits = new Map<string, { url: string; oid?: string }>();
  const events: NonNullable<GithubImportIssue['events']> = [];

  for (const item of timeline) {
    switch (item.__typename) {
      case 'CrossReferencedEvent':
        if (item.source?.__typename === 'PullRequest') addPr(item.source);
        break;
      case 'ReferencedEvent':
        if (item.commit?.url && keep(item.commit.url, 'commit'))
          commits.set(item.commit.url, {
            url: item.commit.url,
            oid: item.commit.oid,
          });
        break;
      case 'ClosedEvent':
      case 'ReopenedEvent':
      case 'LabeledEvent':
      case 'UnlabeledEvent':
      case 'MilestonedEvent': {
        const event = {
          ClosedEvent: 'closed',
          ReopenedEvent: 'reopened',
          LabeledEvent: 'labeled',
          UnlabeledEvent: 'unlabeled',
          MilestonedEvent: 'milestoned',
        }[item.__typename as string] as 'closed';
        events.push({
          event,
          at: item.createdAt,
          actor: item.actor?.login ?? null,
          ...(item.label?.name ? { label: item.label.name } : {}),
          ...(item.milestoneTitle ? { milestone: item.milestoneTitle } : {}),
        });
        break;
      }
    }
  }
  for (const ref of node.closedByPullRequestsReferences?.nodes ?? [])
    addPr(ref);

  return {
    url: node.url,
    repo,
    number: node.number,
    title: node.title,
    body: node.body ?? '',
    state: lower(node.state) === 'closed' ? 'closed' : 'open',
    state_reason: lower(node.stateReason),
    author: node.author?.login ?? null,
    created_at: node.createdAt,
    closed_at: node.closedAt ?? null,
    labels: (node.labels?.nodes ?? []).map((l: Node) => l.name),
    assignees: (node.assignees?.nodes ?? []).map((a: Node) => a.login),
    milestone: node.milestone?.title ?? null,
    comments: (node.comments?.nodes ?? [])
      .filter((c: Node) => c?.url)
      .map((c: Node) => ({
        url: c.url,
        author: c.author?.login ?? null,
        body: c.body ?? '',
        created_at: c.createdAt,
      })),
    linked_prs: [...prs.values()],
    linked_commits: [...commits.values()],
    events: events.slice(0, 100),
    parent_url:
      node.parent?.url && keep(node.parent.url, 'parent issue')
        ? node.parent.url
        : null,
    sub_issue_urls: (node.subIssues?.nodes ?? [])
      .map((s: Node) => s.url)
      .filter((url: string) => keep(url, 'sub-issue')),
  };
}
