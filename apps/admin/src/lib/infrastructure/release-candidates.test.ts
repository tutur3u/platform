import { describe, expect, it } from 'vitest';
import {
  MAX_SCANNED_CANDIDATE_REFS,
  parseCandidateRefs,
  REQUIRED_WORKFLOW_FILES,
  summarizeCandidateRuns,
} from './release-candidates';

const sha = 'a'.repeat(40);
const ref = (name: string, objectSha = sha) => ({
  ref: name,
  object: { sha: objectSha },
});

describe('parseCandidateRefs', () => {
  it('keeps exact candidate refs only', () => {
    expect(
      parseCandidateRefs([
        ref(`refs/heads/release-candidate/${sha}`),
        ref(`refs/heads/other/${sha}`),
        ref(`refs/heads/release-candidate/${'b'.repeat(40)}`, sha),
        ref(`refs/heads/release-candidate/${'A'.repeat(40)}`, 'A'.repeat(40)),
        ref(`refs/heads/release-candidate/${sha}/extra`),
        ref('refs/heads/release-candidate/abc', 'abc'),
        { ref: 5 },
        null,
      ])
    ).toEqual([{ sha }]);
  });
  it('ignores non-arrays and bounds the scan', () => {
    expect(parseCandidateRefs({})).toEqual([]);
    const many = 'abcdef'.split('').map((c) => {
      const s = c.repeat(40);
      return ref(`refs/heads/release-candidate/${s}`, s);
    });
    expect(parseCandidateRefs(many)).toHaveLength(MAX_SCANNED_CANDIDATE_REFS);
  });
});

const run = (over: Record<string, unknown>) => ({
  id: 1,
  name: 'CI',
  path: '.github/workflows/type-check.yaml',
  event: 'workflow_dispatch',
  head_branch: `release-candidate/${sha}`,
  head_sha: sha,
  status: 'completed',
  conclusion: 'success',
  created_at: '2026-11-24T01:00:00Z',
  html_url: 'https://github.com/tutur3u/platform/actions/runs/1',
  ...over,
});
const allRequired = (over: Record<string, unknown> = {}) =>
  REQUIRED_WORKFLOW_FILES.map((file, i) =>
    run({ id: i + 1, path: `.github/workflows/${file}`, ...over })
  );
const statusOf = (
  summary: ReturnType<typeof summarizeCandidateRuns>,
  file: string
) =>
  summary.workflows.find((w) => w.path === `.github/workflows/${file}`)?.status;

describe('summarizeCandidateRuns', () => {
  it('is unknown without evidence runs or for other shas', () => {
    expect(summarizeCandidateRuns(sha, { workflow_runs: [] }).verdict).toBe(
      'unknown'
    );
    expect(
      summarizeCandidateRuns(sha, {
        workflow_runs: [run({ head_sha: 'b'.repeat(40) })],
      }).verdict
    ).toBe('unknown');
    expect(summarizeCandidateRuns(sha, null).newestAt).toBeNull();
  });
  it('is green only when every required workflow is green', () => {
    expect(
      summarizeCandidateRuns(sha, { workflow_runs: allRequired() }).verdict
    ).toBe('green');
    const one = summarizeCandidateRuns(sha, { workflow_runs: [run({})] });
    expect(one.verdict).toBe('pending');
    expect(one.workflows).toHaveLength(REQUIRED_WORKFLOW_FILES.length);
    expect(one.counts.pending).toBe(REQUIRED_WORKFLOW_FILES.length - 1);
  });
  it('ignores workflows outside the required set', () => {
    const summary = summarizeCandidateRuns(sha, {
      workflow_runs: [
        ...allRequired(),
        run({
          id: 99,
          path: '.github/workflows/other.yaml',
          conclusion: 'failure',
        }),
      ],
    });
    expect(summary.verdict).toBe('green');
  });
  it('classifies conclusions', () => {
    const status = (over: Record<string, unknown>) =>
      statusOf(
        summarizeCandidateRuns(sha, { workflow_runs: [run(over)] }),
        'type-check.yaml'
      );
    for (const c of ['success', 'skipped', 'neutral'])
      expect(status({ conclusion: c })).toBe('success');
    for (const c of [
      'failure',
      'timed_out',
      'action_required',
      'startup_failure',
      'stale',
    ])
      expect(status({ conclusion: c })).toBe('failed');
    expect(status({ conclusion: 'cancelled' })).toBe('cancelled');
    expect(status({ status: 'in_progress', conclusion: null })).toBe('pending');
  });
  it('derives red and pending verdicts', () => {
    const withTypeCheck = (over: Record<string, unknown>) =>
      summarizeCandidateRuns(sha, {
        workflow_runs: [
          ...allRequired(),
          run({ id: 50, created_at: '2026-11-24T02:00:00Z', ...over }),
        ],
      }).verdict;
    // A green run of the same workflow outranks newer red or cancelled runs.
    expect(withTypeCheck({ conclusion: 'failure' })).toBe('green');
    const red = allRequired().map((r) =>
      r.path.endsWith('type-check.yaml') ? { ...r, conclusion: 'failure' } : r
    );
    expect(summarizeCandidateRuns(sha, { workflow_runs: red }).verdict).toBe(
      'red'
    );
    const cancelled = allRequired().map((r) =>
      r.path.endsWith('i18n-check.yaml') ? { ...r, conclusion: 'cancelled' } : r
    );
    expect(
      summarizeCandidateRuns(sha, { workflow_runs: cancelled }).verdict
    ).toBe('pending');
  });
  it('counts only main pushes and dispatches on the own candidate ref', () => {
    const status = (over: Record<string, unknown>) =>
      statusOf(
        summarizeCandidateRuns(sha, { workflow_runs: [run(over)] }),
        'type-check.yaml'
      );
    expect(status({ event: 'push', head_branch: 'main' })).toBe('success');
    expect(status({})).toBe('success');
    expect(status({ event: 'pull_request', head_branch: 'fix/x' })).toBe(
      'pending'
    );
    expect(status({ event: 'workflow_dispatch', head_branch: 'main' })).toBe(
      'pending'
    );
    expect(
      status({ event: 'push', head_branch: `release-candidate/${sha}` })
    ).toBe('pending');
  });
  it('drops non-GitHub urls', () => {
    const summary = summarizeCandidateRuns(sha, {
      workflow_runs: [run({ html_url: 'https://evil.example' })],
    });
    expect(
      summary.workflows.find((w) => w.status === 'success')?.url
    ).toBeNull();
  });
});
