export const RELEASE_CANDIDATE_PREFIX = 'release-candidate/';
export const RELEASE_CANDIDATE_REPO = 'tutur3u/platform';
export const MAX_RELEASE_CANDIDATES = 3;
// Refs read per page view. Nominations prune to the newest three, so a few
// extra refs cover a fresh nomination; the newest three by run time are shown.
export const MAX_SCANNED_CANDIDATE_REFS = 5;
// Same set as REQUIRED_WORKFLOWS in scripts/ci/release-candidate-core.mjs;
// scripts/ci/release-candidate.test.mjs keeps the two lists equal.
export const REQUIRED_WORKFLOW_FILES = [
  'codex-plugin.yaml',
  'cron-control-cloudflare.yaml',
  'docs-seo-check.yaml',
  'i18n-check.yaml',
  'oxc-check.yaml',
  'required-account-mfa-contract.yaml',
  'security-checks.yaml',
  'turbo-unit-tests.yaml',
  'type-check.yaml',
] as const;
const WORKFLOW_DIR = '.github/workflows/';

export type CandidateRunStatus = 'success' | 'failed' | 'cancelled' | 'pending';
export type CandidateVerdict = 'green' | 'red' | 'pending' | 'unknown';

export interface CandidateWorkflow {
  name: string;
  path: string;
  event: string;
  headBranch: string;
  status: CandidateRunStatus;
  url: string | null;
}

export interface CandidateSummary {
  sha: string;
  workflows: CandidateWorkflow[];
  counts: Record<CandidateRunStatus, number>;
  verdict: CandidateVerdict;
  newestAt: string | null;
}

const SHA = /^[0-9a-f]{40}$/;
const REF_PREFIX = `refs/heads/${RELEASE_CANDIDATE_PREFIX}`;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Keeps only refs named exactly `refs/heads/release-candidate/<sha>` whose
 * sha is 40 lowercase hex and equals the ref's object sha. GitHub returns
 * refs in lexical order, not time order, so this scans a bounded few; the
 * caller sorts candidates by their newest run and keeps three.
 */
export function parseCandidateRefs(json: unknown): { sha: string }[] {
  if (!Array.isArray(json)) return [];
  const found: { sha: string }[] = [];
  for (const entry of json) {
    const item = record(entry);
    const ref = text(item?.ref);
    const objectSha = text(record(item?.object)?.sha);
    if (!ref || !objectSha || !ref.startsWith(REF_PREFIX)) continue;
    const sha = ref.slice(REF_PREFIX.length);
    if (!SHA.test(sha) || sha !== objectSha) continue;
    if (!found.some((candidate) => candidate.sha === sha)) found.push({ sha });
  }
  return found.slice(0, MAX_SCANNED_CANDIDATE_REFS);
}

function classify(status: unknown, conclusion: unknown): CandidateRunStatus {
  if (status !== 'completed') return 'pending';
  switch (conclusion) {
    case 'success':
    case 'skipped':
    case 'neutral':
      return 'success';
    case 'failure':
    case 'timed_out':
    case 'action_required':
    case 'startup_failure':
    case 'stale':
      return 'failed';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'pending';
  }
}

interface ParsedRun {
  workflow: CandidateWorkflow;
  at: string;
  id: number;
}

// Same evidence rule as scripts/ci/release-candidate-core.mjs: a main push,
// or a dispatch on this SHA's own candidate ref.
function isEvidence(run: Record<string, unknown>, sha: string) {
  if (run.event === 'push') return run.head_branch === 'main';
  return (
    run.event === 'workflow_dispatch' &&
    run.head_branch === `${RELEASE_CANDIDATE_PREFIX}${sha}`
  );
}

function parseRun(sha: string, value: unknown): ParsedRun | null {
  const run = record(value);
  if (!run || run.head_sha !== sha || !isEvidence(run, sha)) return null;
  const path = text(run.path)?.replace(/@.*$/, '');
  const id = typeof run.id === 'number' ? run.id : null;
  const at = text(run.run_started_at) ?? text(run.created_at);
  if (!path || id === null || !at || Number.isNaN(Date.parse(at))) return null;
  const url = text(run.html_url);
  return {
    at,
    id,
    workflow: {
      name: text(run.name) ?? path,
      path,
      event: text(run.event) ?? '',
      headBranch: text(run.head_branch) ?? '',
      status: classify(run.status, run.conclusion),
      // Only link to GitHub; never follow an arbitrary URL from the payload.
      url: url?.startsWith('https://github.com/') ? url : null,
    },
  };
}

// A green run outranks any other run of the same workflow, as in the gate.
function outranks(a: ParsedRun, b: ParsedRun) {
  const aGreen = a.workflow.status === 'success';
  const bGreen = b.workflow.status === 'success';
  return aGreen !== bGreen ? aGreen : isNewer(a, b);
}

function isNewer(a: ParsedRun, b: ParsedRun) {
  const delta = Date.parse(a.at) - Date.parse(b.at);
  return delta !== 0 ? delta > 0 : a.id > b.id;
}

export function summarizeCandidateRuns(
  sha: string,
  json: unknown
): CandidateSummary {
  const runs = record(json)?.workflow_runs;
  const latest = new Map<string, ParsedRun>();
  let newest: ParsedRun | null = null;
  for (const entry of Array.isArray(runs) ? runs : []) {
    const parsed = parseRun(sha, entry);
    if (!parsed) continue;
    const current = latest.get(parsed.workflow.path);
    if (!current || outranks(parsed, current)) {
      latest.set(parsed.workflow.path, parsed);
    }
    if (!newest || isNewer(parsed, newest)) newest = parsed;
  }
  // Only the required set decides; a required workflow without evidence is
  // pending, so a partial set can never read green.
  const workflows = REQUIRED_WORKFLOW_FILES.map(
    (file): CandidateWorkflow =>
      latest.get(`${WORKFLOW_DIR}${file}`)?.workflow ?? {
        name: file,
        path: `${WORKFLOW_DIR}${file}`,
        event: '',
        headBranch: '',
        status: 'pending',
        url: null,
      }
  );
  const counts = { success: 0, failed: 0, cancelled: 0, pending: 0 };
  for (const workflow of workflows) counts[workflow.status] += 1;
  let verdict: CandidateVerdict = 'green';
  if (!newest) verdict = 'unknown';
  else if (counts.failed > 0) verdict = 'red';
  else if (counts.success < workflows.length) verdict = 'pending';
  return {
    sha,
    workflows,
    counts,
    verdict,
    newestAt: newest ? new Date(newest.at).toISOString() : null,
  };
}
