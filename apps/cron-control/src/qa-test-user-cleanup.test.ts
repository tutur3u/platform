import { expect, it } from 'vite-plus/test';
import {
  CRON_TRIGGERS,
  findJob,
  leaseMs,
  maxAttempts,
  parseEnabledJobs,
} from './jobs';

it('schedules QA test user cleanup as a bounded, default-off web slot', () => {
  const job = findJob('web-qa-test-user-cleanup');
  expect(job).toMatchObject({
    cron: '*/15 * * * *',
    method: 'POST',
    overlap: 'claim-fenced',
    path: '/api/cron/qa/test-user-cleanup',
    target: 'web',
    timeoutMs: 90_000,
  });
  if (!job) throw new Error('missing job');
  expect(job.workerProcessor).toBeUndefined();
  expect(maxAttempts(job)).toBe(2);
  expect(leaseMs(job)).toBe(210_000);
  // Reuses an existing trigger, so the Worker's cron trigger set is unchanged.
  expect(CRON_TRIGGERS.filter((cron) => cron === job.cron)).toHaveLength(1);
  expect(parseEnabledJobs('').enabled.has(job.id)).toBe(false);
});
