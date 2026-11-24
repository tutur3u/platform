import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fixture,
  recoveryWorld,
  repo,
} from './fixtures/marker-producer-world.mjs';

// Manual migration recovery may hold a Cron Control deploy that failed only at
// its serving-proof step; every other Cron failure stays denied.
function cronRecoveryWorld(world, failedStep) {
  recoveryWorld(world);
  for (const job of world.jobs)
    if (job.name === 'deploy-meet-cloudflare / deploy') {
      job.conclusion = 'success';
      job.steps = [{ ...job.steps[0], conclusion: 'success' }];
    }
  for (const [stage, conclusion, steps] of [
    ['validate', 'success', [{ name: 'Build', conclusion: 'success' }]],
    [
      'deploy',
      'failure',
      [
        { name: failedStep, conclusion: 'failure' },
        {
          name: 'Publish the exact artifact with its secrets',
          conclusion: 'skipped',
        },
      ],
    ],
  ])
    world.jobs.push({
      ...world.jobs[0],
      id: 900 + world.jobs.length,
      name: `deploy-cron-control-cloudflare / ${stage}`,
      conclusion,
      steps: steps.map((step) => ({ ...step, status: 'completed' })),
    });
  world.replies.get(
    `/repos/${repo}/actions/runs/301/attempts/1/jobs?per_page=100&page=1`
  ).total_count = world.jobs.length;
}

test('manual recovery admits a Cron Control serving-proof failure', async (t) => {
  const { result } = await fixture(t, (world) =>
    cronRecoveryWorld(world, 'Verify the prebuilt artifact is already serving')
  );
  assert.equal(result.status, 'success');
});

test('a failed Cron Control deploy is denied without the recovery opt-in', async (t) => {
  const { result } = await fixture(t, (world) => {
    cronRecoveryWorld(world, 'Verify the prebuilt artifact is already serving');
    delete world.env.ALLOW_FAILED_PLANNER;
  });
  assert.equal(result.status, 'denied');
  // Without the opt-in, a failed planner is refused before its jobs are read.
  assert.equal(result.phase, 'marker');
});

test('manual recovery still denies a Cron Control failure at another step', async (t) => {
  const { result } = await fixture(t, (world) =>
    cronRecoveryWorld(world, 'Capture and verify settings before publication')
  );
  assert.equal(result.status, 'denied');
  assert.equal(result.phase, 'jobs');
});
