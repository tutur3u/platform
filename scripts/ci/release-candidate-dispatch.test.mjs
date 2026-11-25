import assert from 'node:assert/strict';
import test from 'node:test';
import { DISPATCHED_WORKFLOWS } from './release-candidate-core.mjs';
import { createGitHub, nominate, status } from './release-candidate.mjs';

// A candidate older than a workflow's workflow_dispatch trigger cannot run
// that workflow on its candidate ref; GitHub answers 422. The pass records
// it as not dispatchable, keeps dispatching the rest, and the workflow's
// evidence comes from the main push.
const SHA = 'a'.repeat(40);
const OLD = 'turbo-unit-tests.yaml';

test('a 422 dispatch reports not dispatchable; other failures still refuse', async () => {
  const answers = {
    [OLD]: 422,
    'type-check.yaml': 204,
    'i18n-check.yaml': 500,
  };
  const github = createGitHub({
    token: 't',
    repository: 'tutur3u/platform',
    fetchImpl: async (url) => {
      const file = /workflows\/([^/]+)\/dispatches/.exec(url)?.[1];
      return new Response(null, { status: answers[file] });
    },
  });
  assert.equal(await github.dispatch(OLD, SHA), false);
  assert.equal(await github.dispatch('type-check.yaml', SHA), true);
  await assert.rejects(
    github.dispatch('i18n-check.yaml', SHA),
    /CANDIDATE_GITHUB/
  );
});

function fakeGitHub({ refs = [] } = {}) {
  const calls = [];
  const state = { refs: [...refs] };
  return {
    calls,
    repositoryId: async () => 42,
    inMain: async () => true,
    candidates: async () => [...state.refs],
    committedAt: async () => '2026-11-24T00:00:00Z',
    createRef: async (sha) => {
      calls.push(['createRef', sha]);
      state.refs.push(sha);
    },
    deleteRef: async (sha) => calls.push(['deleteRef', sha]),
    runs: async () => [],
    dispatch: async (file, sha) => {
      calls.push(['dispatch', file, sha]);
      return file !== OLD;
    },
    rerun: async (id) => calls.push(['rerun', id]),
  };
}

test('nomination dispatches every other workflow past an undispatchable one', async () => {
  const github = fakeGitHub();
  const result = await nominate({ github, sha: SHA });
  assert.deepEqual(result.undispatchable, [OLD]);
  assert.deepEqual(
    result.dispatched,
    DISPATCHED_WORKFLOWS.filter((file) => file !== OLD)
  );
  assert.equal(
    github.calls.filter(([kind]) => kind === 'dispatch').length,
    DISPATCHED_WORKFLOWS.length
  );
});

test('a status pass reports an undispatchable workflow instead of failing', async () => {
  const github = fakeGitHub({ refs: [SHA] });
  const result = await status({ github, sha: SHA });
  assert.deepEqual(result.undispatchable, [OLD]);
  assert.ok(!result.recovery.dispatch.includes(OLD));
});
