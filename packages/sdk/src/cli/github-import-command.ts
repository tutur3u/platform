import { readFile } from 'node:fs/promises';
import type {
  GithubImportIssue,
  GithubImportMapping,
  GithubImportResult,
} from '@tuturuuu/internal-api/task-collaboration';
import type { TuturuuuUserClient } from '../platform';
import { type FlagValue, getFlag } from './args';
import { collaborationApi } from './task-collaboration-command';
import {
  fetchGithubIssues,
  GITHUB_PAGE_SIZE,
  type GithubSourceOptions,
  normalizeGithubIssue,
  parseRepo,
} from './github-import-source';

export const MAX_IMPORT_BATCH_SIZE = 25;
const MAX_POST_ATTEMPTS = 4;

export interface GithubImportOptions {
  board: string;
  repo: string | null;
  state: 'all' | 'open' | 'closed';
  since: string | null;
  limit: number | null;
  only: Set<number> | null;
  exclude: Set<number>;
  mappingPath: string | null;
  dryRun: boolean;
  inputPath: string | null;
  batchSize: number;
  refresh: boolean;
  refreshContent: boolean;
}

export interface GithubImportDeps {
  api?: Pick<ReturnType<typeof collaborationApi>, 'importGithub'>;
  fetchIssues?: (
    options: GithubSourceOptions
  ) => Promise<Record<string, unknown>[]>;
  sleep?: (ms: number) => Promise<void>;
  progress?: (message: string) => void;
}

function parseNumberList(raw: string | undefined, flag: string) {
  if (raw === undefined) return null;
  const numbers = raw
    .split(',')
    .map((part) => part.trim().replace(/^#/u, ''))
    .filter(Boolean)
    .map((part) => Number.parseInt(part, 10));
  if (!numbers.length || numbers.some((n) => !Number.isInteger(n) || n <= 0)) {
    throw new Error(`--${flag} takes a comma-separated list of issue numbers.`);
  }
  return new Set(numbers);
}

export function parseGithubImportFlags(
  flags: Record<string, FlagValue>
): GithubImportOptions {
  const from = getFlag(flags, 'from');
  if (from !== 'github') throw new Error('Only --from github is supported.');
  const board = getFlag(flags, 'board');
  if (!board) throw new Error('Missing --board <board-id>.');
  const state = (getFlag(flags, 'state') ?? 'all').toLowerCase();
  if (state !== 'all' && state !== 'open' && state !== 'closed') {
    throw new Error('--state must be all, open or closed.');
  }
  const since = getFlag(flags, 'since') ?? null;
  if (since && Number.isNaN(Date.parse(since)))
    throw new Error('--since needs a date such as 2026-01-31.');
  const limitRaw = getFlag(flags, 'limit');
  const limit = limitRaw === undefined ? null : Number.parseInt(limitRaw, 10);
  if (limit !== null && (!Number.isInteger(limit) || limit <= 0))
    throw new Error('--limit must be a positive number.');
  const batchRaw = getFlag(flags, 'batch-size');
  const batchSize =
    batchRaw === undefined
      ? MAX_IMPORT_BATCH_SIZE
      : Number.parseInt(batchRaw, 10);
  if (
    !Number.isInteger(batchSize) ||
    batchSize < 1 ||
    batchSize > MAX_IMPORT_BATCH_SIZE
  ) {
    throw new Error(
      `--batch-size must be between 1 and ${MAX_IMPORT_BATCH_SIZE}.`
    );
  }
  const repo = getFlag(flags, 'repo') ?? null;
  const inputPath = getFlag(flags, 'input') ?? null;
  if (!repo && !inputPath) throw new Error('Missing --repo owner/name.');
  if (repo) parseRepo(repo);
  return {
    board,
    repo,
    state,
    since,
    limit,
    only: parseNumberList(
      getFlag(flags, 'issues') ?? getFlag(flags, 'only-issues'),
      'issues'
    ),
    exclude:
      parseNumberList(getFlag(flags, 'exclude-issues'), 'exclude-issues') ??
      new Set(),
    mappingPath: getFlag(flags, 'mapping') ?? null,
    dryRun: flags['dry-run'] === true,
    inputPath,
    batchSize,
    refresh: flags.refresh === true,
    refreshContent: flags['refresh-content'] === true,
  };
}

/** Applies the selection flags in a fixed order: state, since, only, exclude, limit. */
export function selectIssues(
  issues: GithubImportIssue[],
  options: Pick<
    GithubImportOptions,
    'state' | 'since' | 'only' | 'exclude' | 'limit'
  >
) {
  const since = options.since ? Date.parse(options.since) : null;
  const selected = issues
    .filter((issue) => options.state === 'all' || issue.state === options.state)
    .filter(
      (issue) =>
        since === null ||
        Date.parse(issue.closed_at ?? issue.created_at) >= since ||
        issue.state === 'open'
    )
    .filter((issue) => !options.only || options.only.has(issue.number))
    .filter((issue) => !options.exclude.has(issue.number))
    .sort(
      (a, b) =>
        Date.parse(a.created_at) - Date.parse(b.created_at) ||
        a.number - b.number
    );
  return options.limit ? selected.slice(0, options.limit) : selected;
}

export function chunk<T>(items: T[], size: number) {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size)
    out.push(items.slice(index, index + size));
  return out;
}

export async function loadGithubMapping(
  path: string | null
): Promise<GithubImportMapping> {
  if (!path) return { status_lists: {} };
  const parsed = JSON.parse(
    await readFile(path, 'utf8')
  ) as GithubImportMapping;
  if (!parsed || typeof parsed !== 'object' || !parsed.status_lists) {
    throw new Error('The mapping file needs a status_lists object.');
  }
  return parsed;
}

async function loadIssues(
  options: GithubImportOptions,
  deps: GithubImportDeps
) {
  if (options.inputPath) {
    const raw = JSON.parse(await readFile(options.inputPath, 'utf8')) as Record<
      string,
      unknown
    >[];
    if (!Array.isArray(raw))
      throw new Error('The --input file must hold an array of issues.');
    const fallbackRepo = options.repo ?? 'unknown/unknown';
    return raw.map((node) =>
      normalizeGithubIssue(
        node,
        options.repo ?? repoFromUrl(String(node.url)) ?? fallbackRepo
      )
    );
  }
  const fetchIssues = deps.fetchIssues ?? fetchGithubIssues;
  // Number filters need no more than the first pages; --limit alone does too.
  const nodes = await fetchIssues({
    repo: options.repo!,
    state: options.state,
    refresh: options.refresh,
    maxIssues:
      options.only || options.since
        ? undefined
        : options.limit
          ? options.limit + options.exclude.size + GITHUB_PAGE_SIZE
          : undefined,
    onProgress: deps.progress,
  });
  return nodes.map((node) => normalizeGithubIssue(node, options.repo!));
}

function repoFromUrl(url: string) {
  return (
    /^https:\/\/github\.com\/([^/]+\/[^/]+)\/issues\//u.exec(url)?.[1] ?? null
  );
}

function isTransient(error: unknown) {
  return /\b(429|502|503|504)\b|rate limit|too many requests|timeout/iu.test(
    String((error as Error)?.message ?? error)
  );
}

export type GithubImportSummary = {
  dryRun: boolean;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  warnings: Record<string, number>;
  failures: Array<{ number: number; url: string; error: string }>;
};

export function summarizeResults(
  results: GithubImportResult[],
  dryRun: boolean
): GithubImportSummary {
  const summary: GithubImportSummary = {
    dryRun,
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
    warnings: {},
    failures: [],
  };
  for (const result of results) {
    if (result.error) {
      summary.failed += 1;
      summary.failures.push({
        number: result.number,
        url: result.url,
        error: result.error,
      });
      continue;
    }
    if (result.action === 'create') summary.created += 1;
    else if (result.action === 'update') summary.updated += 1;
    else summary.skipped += 1;
    for (const warning of result.warnings) {
      const kind = warning.split(':')[0]!;
      summary.warnings[kind] = (summary.warnings[kind] ?? 0) + 1;
    }
  }
  return summary;
}

export function formatSummary(summary: GithubImportSummary) {
  const lines = [
    `${summary.dryRun ? 'Dry run: ' : ''}${summary.created} created, ${summary.updated} updated, ${summary.skipped} skipped, ${summary.failed} failed`,
  ];
  const warnings = Object.entries(summary.warnings).map(
    ([kind, count]) => `${kind} x${count}`
  );
  if (warnings.length) lines.push(`Warnings: ${warnings.join(', ')}`);
  for (const failure of summary.failures.slice(0, 20)) {
    lines.push(`Failed #${failure.number}: ${failure.error}`);
  }
  return lines.join('\n');
}

/**
 * `ttr tasks import --from github ...`: reads issues with the local gh login,
 * posts batches of at most 25, and prints a create/update/skip summary.
 */
export async function runGithubImport(
  client: TuturuuuUserClient,
  workspaceId: string,
  flags: Record<string, FlagValue>,
  json: boolean,
  deps: GithubImportDeps = {}
) {
  const options = parseGithubImportFlags(flags);
  const api = deps.api ?? collaborationApi(client);
  const sleep =
    deps.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const mapping = await loadGithubMapping(options.mappingPath);
  const issues = selectIssues(await loadIssues(options, deps), options);
  if (!issues.length) {
    process.stdout.write(
      json
        ? `${JSON.stringify({ summary: summarizeResults([], options.dryRun), results: [] })}\n`
        : 'No issues matched.\n'
    );
    return;
  }

  const results: GithubImportResult[] = [];
  const batches = chunk(issues, options.batchSize);
  for (const [index, batch] of batches.entries()) {
    deps.progress?.(
      `import batch ${index + 1}/${batches.length} (${batch.length} issues)`
    );
    for (let attempt = 1; ; attempt += 1) {
      try {
        const response = await api.importGithub(workspaceId, {
          board_id: options.board,
          dry_run: options.dryRun,
          refresh_content: options.refreshContent,
          mapping,
          issues: batch,
        });
        results.push(...response.results);
        break;
      } catch (error) {
        if (attempt >= MAX_POST_ATTEMPTS || !isTransient(error)) throw error;
        await sleep(2 ** attempt * 1000);
      }
    }
  }

  const summary = summarizeResults(results, options.dryRun);
  process.stdout.write(
    json
      ? `${JSON.stringify({ summary, results }, null, 2)}\n`
      : `${formatSummary(summary)}\n`
  );
  if (summary.failed) process.exitCode = 1;
}
