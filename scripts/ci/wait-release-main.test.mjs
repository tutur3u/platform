import assert from 'node:assert/strict';
import { test } from 'node:test';
import { waitReleaseMain } from './wait-release-main.mjs';

const sha = 'a'.repeat(40);
const passed = { databaseId: 1, status: 'completed', conclusion: 'success' };
function fixture(observations, remote = sha) {
  let clock = 0;
  let polls = 0;
  return {
    options: {
      repository: 'tutur3u/platform',
      currentRun: '99',
      log() {},
      now: () => clock,
      timeoutMs: 120_000,
      sleep: async (ms) => {
        clock += ms;
      },
      run: (command, args) => {
        if (command === 'git')
          return args[0] === 'rev-parse' ? sha : `${remote}\trefs/heads/main`;
        return JSON.stringify(
          observations[Math.min(polls++, observations.length - 1)]
        );
      },
    },
    polls: () => polls,
  };
}
test('waits for all checks and a settled second observation, excluding only itself', async () => {
  const self = { databaseId: 99, status: 'in_progress' };
  const f = fixture([[self], [passed, self], [passed, self]]);
  assert.equal(await waitReleaseMain(f.options), sha);
  assert.equal(f.polls(), 3);
});
test('fails closed for failing CI and when main advances', async () => {
  await assert.rejects(
    waitReleaseMain(fixture([[{ ...passed, conclusion: 'failure' }]]).options),
    /CI failed/
  );
  await assert.rejects(
    waitReleaseMain(fixture([[passed]], 'b'.repeat(40)).options),
    /Main changed/
  );
});
test('does not treat missing or unfinished workflows as success', async () => {
  for (const runs of [[], [{ databaseId: 1, status: 'in_progress' }]]) {
    await assert.rejects(waitReleaseMain(fixture([runs]).options), /Timed out/);
  }
});
test('waits again when another workflow appears after an initially green set', async () => {
  const second = { ...passed, databaseId: 2 };
  const f = fixture([[passed], [passed, second], [passed, second]]);
  assert.equal(await waitReleaseMain(f.options), sha);
  assert.equal(f.polls(), 3);
});
