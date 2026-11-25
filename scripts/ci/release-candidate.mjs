#!/usr/bin/env node
// Release candidates: `nominate` pins a main commit on
// `release-candidate/<sha>` and dispatches the workflows main pushes keep
// superseding; `status` reports the required set at that SHA and recovers
// cancelled runs once. Runs in .github/workflows/release-candidate.yaml.
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  CANDIDATE_PREFIX,
  CandidateRefusal,
  DISPATCHED_WORKFLOWS,
  REPOSITORY,
  candidateBranch,
  parseCandidateRefs,
  planNomination,
  planPrune,
  planRecovery,
  requireBoundedRefs,
  renderSummary,
  requireSha,
  summarize,
} from './release-candidate-core.mjs';

const API = 'https://api.github.com';
const MAX_RUN_PAGES = 3;

export function createGitHub({ token, fetchImpl = fetch, repository }) {
  if (repository !== REPOSITORY)
    throw new CandidateRefusal('CANDIDATE_REPOSITORY', String(repository));
  if (!token) throw new CandidateRefusal('CANDIDATE_TOKEN_MISSING');
  async function call(method, path, body, { allow = [] } = {}) {
    const response = await fetchImpl(`${API}/repos/${REPOSITORY}${path}`, {
      method,
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'x-github-api-version': '2022-11-28',
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok && !allow.includes(response.status))
      throw new CandidateRefusal(
        'CANDIDATE_GITHUB',
        `${method} ${path} -> ${response.status}`
      );
    if (response.status === 204 || !response.ok)
      return { status: response.status, body: null };
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  }
  return {
    async repositoryId() {
      const { body } = await call('GET', '');
      return body?.id;
    },
    // compare main...sha is "behind" or "identical" exactly when sha is an
    // ancestor of (or equal to) main.
    async inMain(sha) {
      const { body } = await call('GET', `/compare/main...${sha}`);
      return body?.status === 'behind' || body?.status === 'identical';
    },
    async candidates() {
      const { status, body } = await call(
        'GET',
        `/git/matching-refs/heads/${CANDIDATE_PREFIX}`,
        null,
        { allow: [404] }
      );
      return status === 404 ? [] : parseCandidateRefs(body);
    },
    async committedAt(sha) {
      const { body } = await call('GET', `/commits/${sha}`);
      return body?.commit?.committer?.date ?? null;
    },
    async createRef(sha) {
      await call('POST', '/git/refs', {
        ref: `refs/heads/${candidateBranch(sha)}`,
        sha,
      });
    },
    async deleteRef(sha) {
      await call('DELETE', `/git/refs/heads/${candidateBranch(sha)}`, null, {
        allow: [404, 422],
      });
    },
    async runs(sha) {
      const all = [];
      for (let page = 1; page <= MAX_RUN_PAGES; page += 1) {
        const { body } = await call(
          'GET',
          `/actions/runs?head_sha=${sha}&per_page=100&page=${page}`
        );
        const batch = Array.isArray(body?.workflow_runs)
          ? body.workflow_runs
          : [];
        all.push(...batch);
        if (batch.length < 100) break;
      }
      return all;
    },
    // False when the workflow file at the candidate commit has no
    // workflow_dispatch trigger (422): a commit older than that trigger
    // keeps its evidence from the main push.
    async dispatch(file, sha) {
      const { status } = await call(
        'POST',
        `/actions/workflows/${file}/dispatches`,
        { ref: candidateBranch(sha) },
        { allow: [422] }
      );
      return status !== 422;
    },
    async rerun(runId) {
      await call('POST', `/actions/runs/${runId}/rerun`);
    },
  };
}

async function activeCandidates(github, shas) {
  const active = [];
  for (const sha of shas) {
    const runs = await github.runs(sha);
    if (
      runs.some(
        (run) =>
          run.head_branch === candidateBranch(sha) && run.status !== 'completed'
      )
    )
      active.push(sha);
  }
  return active;
}

export async function nominate({ github, sha, now = Date.now(), log }) {
  requireSha(sha);
  const inMain = await github.inMain(sha);
  if (!inMain) throw new CandidateRefusal('CANDIDATE_NOT_IN_MAIN', sha);
  const existing = requireBoundedRefs(await github.candidates());
  const plan = planNomination({
    sha,
    inMain,
    existing,
    activeShas: await activeCandidates(github, existing),
  });
  if (plan.createRef) await github.createRef(sha);
  const repositoryId = await github.repositoryId();
  const summary = summarize({
    sha,
    runs: await github.runs(sha),
    repositoryId,
  });
  // Dispatch only workflows without a candidate run, so a repeated
  // nomination of the same SHA never doubles the set.
  const dispatched = [];
  const undispatchable = [];
  for (const workflow of summary.workflows) {
    if (!workflow.dispatched || workflow.hasCandidateRun) continue;
    if ((await github.dispatch(workflow.file, sha)) === false)
      undispatchable.push(workflow.file);
    else dispatched.push(workflow.file);
  }
  const dated = [];
  for (const other of existing.filter((candidate) => candidate !== sha))
    dated.push({ sha: other, committedAt: await github.committedAt(other) });
  dated.push({ sha, committedAt: await github.committedAt(sha) });
  const pruned = planPrune({ candidates: dated, keep: sha, now });
  for (const old of pruned) await github.deleteRef(old);
  log?.(
    `candidate ${sha}: ref ${plan.createRef ? 'created' : 'kept'}; dispatched ${dispatched.join(', ') || 'nothing'}; not dispatchable at this commit ${undispatchable.join(', ') || 'none'}; pruned ${pruned.join(', ') || 'nothing'}`
  );
  return { createdRef: plan.createRef, dispatched, undispatchable, pruned };
}

export async function status({ github, sha, recover = true, log }) {
  requireSha(sha);
  if (!(await github.inMain(sha)))
    throw new CandidateRefusal('CANDIDATE_NOT_IN_MAIN', sha);
  const repositoryId = await github.repositoryId();
  const summary = summarize({
    sha,
    runs: await github.runs(sha),
    repositoryId,
  });
  const recovery = recover
    ? planRecovery(summary)
    : { rerun: [], dispatch: [] };
  const candidates = await github.candidates();
  // Dispatching needs the candidate ref; status never creates one.
  if (!candidates.includes(sha)) recovery.dispatch = [];
  for (const runId of recovery.rerun) await github.rerun(runId);
  const undispatchable = [];
  for (const file of recovery.dispatch)
    if ((await github.dispatch(file, sha)) === false) undispatchable.push(file);
  recovery.dispatch = recovery.dispatch.filter(
    (file) => !undispatchable.includes(file)
  );
  log?.(
    `candidate ${sha}: ${summary.verdict}; reran ${recovery.rerun.join(', ') || 'nothing'}; dispatched ${recovery.dispatch.join(', ') || 'nothing'}; not dispatchable at this commit ${undispatchable.join(', ') || 'none'}`
  );
  return { summary, recovery, undispatchable };
}

async function main(argv, env) {
  const [command] = argv;
  if (command !== 'nominate' && command !== 'status')
    throw new CandidateRefusal('CANDIDATE_USAGE', 'nominate|status');
  const github = createGitHub({
    token: env.GH_TOKEN,
    repository: env.GITHUB_REPOSITORY,
  });
  const sha = requireSha(env.CANDIDATE_SHA);
  const log = (line) => console.log(line);
  if (command === 'nominate') await nominate({ github, sha, log });
  const { summary } = await status({
    github,
    sha,
    recover: command === 'status',
    log,
  });
  if (env.GITHUB_STEP_SUMMARY)
    appendFileSync(env.GITHUB_STEP_SUMMARY, renderSummary(summary));
  console.log(
    `required set: ${DISPATCHED_WORKFLOWS.length} dispatched + observed; verdict ${summary.verdict}`
  );
  // Status fails only on a red required workflow; pending is not an error.
  if (command === 'status' && summary.verdict === 'red') process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main(process.argv.slice(2), process.env).catch((error) => {
    console.error(error instanceof CandidateRefusal ? error.message : error);
    process.exitCode = 1;
  });
}
