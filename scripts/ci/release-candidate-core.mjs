// Pure planning for release candidates: a main commit the production owner
// nominates so its full required CI set completes while main keeps moving.
// The candidate ref `release-candidate/<sha>` gives the dispatched runs their
// own concurrency groups, so later main pushes can never supersede them.
// See apps/docs/build/devops/release-candidates.mdx.

export const REPOSITORY = 'tutur3u/platform';
export const CANDIDATE_PREFIX = 'release-candidate/';
// A nomination is refused while this many other candidates still run.
export const MAX_ACTIVE_CANDIDATES = 2;
// Pruning keeps the newest candidates and drops any older than the age cap.
export const KEEP_CANDIDATES = 3;
// Hard cap on candidate refs a pass will inspect. Pruning keeps three, so more
// means refs were created by hand; refuse before any per-candidate call.
export const MAX_CANDIDATE_REFS = 8;
export const MAX_CANDIDATE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
// One automatic rerun per cancelled run; reruns take a unique group.
export const MAX_AUTOMATIC_ATTEMPT = 1;

// Main pushes coalesce these into one shared pending run, so an earlier
// commit rarely keeps one. Cron Control is path-filtered: dispatch forces
// its producer. scripts/ci/release-candidate.test.mjs keeps this list equal
// to every always-on main workflow that a later push may supersede.
export const DISPATCHED_WORKFLOWS = Object.freeze([
  'codex-plugin.yaml',
  'cron-control-cloudflare.yaml',
  'docs-seo-check.yaml',
  'i18n-check.yaml',
  'required-account-mfa-contract.yaml',
  'security-checks.yaml',
]);
// Each main SHA already keeps its own non-cancelling run of these.
export const OBSERVED_WORKFLOWS = Object.freeze([
  'oxc-check.yaml',
  'turbo-unit-tests.yaml',
  'type-check.yaml',
]);
export const REQUIRED_WORKFLOWS = Object.freeze(
  [...DISPATCHED_WORKFLOWS, ...OBSERVED_WORKFLOWS].sort()
);

const SHA = /^[0-9a-f]{40}$/u;
const GREEN = new Set(['success', 'skipped', 'neutral']);
const RED = new Set([
  'failure',
  'timed_out',
  'action_required',
  'startup_failure',
  'stale',
]);

export class CandidateRefusal extends Error {
  constructor(code, detail = '') {
    super(detail ? `${code}: ${detail}` : code);
    this.code = code;
  }
}

export function requireSha(value) {
  const sha = String(value ?? '').trim();
  if (!SHA.test(sha)) throw new CandidateRefusal('CANDIDATE_SHA_INVALID');
  return sha;
}

export const candidateBranch = (sha) => `${CANDIDATE_PREFIX}${requireSha(sha)}`;

// Only `refs/heads/release-candidate/<sha>` refs that point at their own SHA
// count; anything else under the prefix is ignored and never pruned.
export function parseCandidateRefs(refs) {
  if (!Array.isArray(refs)) return [];
  const out = [];
  for (const entry of refs) {
    const ref = entry?.ref;
    const sha = entry?.object?.sha;
    if (typeof ref !== 'string' || typeof sha !== 'string') continue;
    if (ref !== `refs/heads/${CANDIDATE_PREFIX}${sha}` || !SHA.test(sha))
      continue;
    out.push(sha);
  }
  return out;
}

const workflowFile = (run) =>
  typeof run?.path === 'string'
    ? run.path.replace(/^\.github\/workflows\//u, '').replace(/@.*$/u, '')
    : '';

// A run is evidence for the SHA only from a main push or from a dispatch on
// that SHA's own candidate ref, in this repository.
export function isEvidenceRun(run, sha, repositoryId) {
  if (run?.head_sha !== sha) return false;
  if (
    !Number.isSafeInteger(repositoryId) ||
    run.repository?.id !== repositoryId ||
    run.head_repository?.id !== repositoryId
  )
    return false;
  if (run.event === 'push') return run.head_branch === 'main';
  return (
    run.event === 'workflow_dispatch' &&
    run.head_branch === `${CANDIDATE_PREFIX}${sha}`
  );
}

export function classifyRun(run) {
  if (run?.status !== 'completed') return 'pending';
  if (GREEN.has(run.conclusion)) return 'success';
  if (run.conclusion === 'cancelled') return 'cancelled';
  if (RED.has(run.conclusion)) return 'failed';
  return 'failed';
}

const startedAt = (run) =>
  Date.parse(run?.run_started_at ?? run?.created_at ?? '') || 0;

// Green wins over any other run of the same workflow; otherwise the newest
// run (latest start, then highest id) decides.
function pickRun(runs) {
  const green = runs.filter((run) => classifyRun(run) === 'success');
  const pool = green.length > 0 ? green : runs;
  return [...pool].sort(
    (a, b) => startedAt(b) - startedAt(a) || (b.id ?? 0) - (a.id ?? 0)
  )[0];
}

export function summarize({ sha, runs, repositoryId }) {
  requireSha(sha);
  const byWorkflow = new Map();
  for (const run of Array.isArray(runs) ? runs : []) {
    if (!isEvidenceRun(run, sha, repositoryId)) continue;
    const file = workflowFile(run);
    if (!REQUIRED_WORKFLOWS.includes(file)) continue;
    byWorkflow.set(file, [...(byWorkflow.get(file) ?? []), run]);
  }
  const workflows = REQUIRED_WORKFLOWS.map((file) => {
    const all = byWorkflow.get(file) ?? [];
    const run = all.length > 0 ? pickRun(all) : null;
    return {
      file,
      dispatched: DISPATCHED_WORKFLOWS.includes(file),
      state: run ? classifyRun(run) : 'missing',
      runId: run?.id ?? null,
      attempt: run?.run_attempt ?? null,
      event: run?.event ?? null,
      url: run?.html_url ?? null,
      hasCandidateRun: all.some((r) => r.event === 'workflow_dispatch'),
    };
  });
  const states = workflows.map((w) => w.state);
  const verdict = states.includes('failed')
    ? 'red'
    : states.every((state) => state === 'success')
      ? 'green'
      : 'pending';
  return { sha, verdict, workflows };
}

// Cancelled evidence gets one rerun; a dispatched workflow without any
// candidate run (and no green main run) gets dispatched on the candidate ref.
export function planRecovery(summary) {
  const rerun = [];
  const dispatch = [];
  for (const workflow of summary.workflows) {
    if (
      workflow.state === 'cancelled' &&
      (workflow.attempt ?? 0) <= MAX_AUTOMATIC_ATTEMPT
    )
      rerun.push(workflow.runId);
    else if (
      workflow.dispatched &&
      !workflow.hasCandidateRun &&
      (workflow.state === 'missing' || workflow.state === 'cancelled')
    )
      dispatch.push(workflow.file);
  }
  return { rerun, dispatch };
}

// `activeShas` lists other candidates with queued or running candidate runs.
export function requireBoundedRefs(existing) {
  if (existing.length > MAX_CANDIDATE_REFS)
    throw new CandidateRefusal('CANDIDATE_REF_LIMIT', String(existing.length));
  return existing;
}

export function planNomination({ sha, inMain, existing, activeShas }) {
  requireSha(sha);
  if (inMain !== true) throw new CandidateRefusal('CANDIDATE_NOT_IN_MAIN', sha);
  const others = activeShas.filter((other) => other !== sha);
  if (others.length >= MAX_ACTIVE_CANDIDATES)
    throw new CandidateRefusal('CANDIDATE_LIMIT', others.join(','));
  return { createRef: !existing.includes(sha) };
}

// `candidates` is [{ sha, committedAt }] for existing candidate refs.
export function planPrune({ candidates, keep, now }) {
  const sorted = [...candidates].sort(
    (a, b) =>
      (Date.parse(b.committedAt) || 0) - (Date.parse(a.committedAt) || 0)
  );
  return sorted
    .filter(
      (candidate, index) =>
        candidate.sha !== keep &&
        (index >= KEEP_CANDIDATES ||
          now - (Date.parse(candidate.committedAt) || 0) > MAX_CANDIDATE_AGE_MS)
    )
    .map((candidate) => candidate.sha);
}

export function renderSummary(summary) {
  const lines = [
    `### Release candidate \`${summary.sha}\`: ${summary.verdict}`,
    '',
    '| Workflow | State | Source | Run |',
    '| --- | --- | --- | --- |',
  ];
  for (const w of summary.workflows) {
    const source = w.event === 'push' ? 'main push' : (w.event ?? '-');
    const run = w.url ? `[${w.runId} #${w.attempt}](${w.url})` : '-';
    lines.push(`| ${w.file} | ${w.state} | ${source} | ${run} |`);
  }
  return `${lines.join('\n')}\n`;
}
