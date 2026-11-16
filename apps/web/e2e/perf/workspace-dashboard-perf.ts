import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { expect, type Page, test } from '@playwright/test';

/*
 * Workspace home performance adapter, run unchanged against the baseline
 * commit (9a687b51, Mira-only home) and the sealed d head, on the same host,
 * browser and synthetic data. Nothing here changes either commit's source.
 *
 * PERF_TARGET=app     the running Next app at BASE_URL (authenticated
 *                     storage state, like playwright.config.ts). Both commits.
 * PERF_TARGET=fixture the standalone dashboard fixture (d head only).
 * PERF_LABEL          `baseline` or `head` (written into the result).
 * PERF_SAMPLES        samples per scenario (default 20).
 * PERF_OUTPUT         JSON path (default test-results/workspace-dashboard-perf-<label>.json).
 *
 * Render counts are React commits observed through a devtools global hook
 * installed before the page loads, so they work on production builds of both
 * commits. Bundle bytes are not measured here; they come from CI artifacts.
 */
const TARGET = process.env.PERF_TARGET === 'fixture' ? 'fixture' : 'app';
const LABEL = process.env.PERF_LABEL ?? 'head';
const SAMPLES = Number(process.env.PERF_SAMPLES ?? 20);
const PATH = TARGET === 'fixture' ? '/?ui=classic&state=ready&names=long' : '/en/personal';
const OUTPUT =
  process.env.PERF_OUTPUT ?? `test-results/workspace-dashboard-perf-${LABEL}.json`;

type Sample = { ms: number; commits: number };
type Result =
  | { scenario: string; status: 'measured'; samples: number; medianMs: number; p95Ms: number; medianCommits: number; p95Commits: number }
  | { scenario: string; status: 'not-applicable'; reason: string };

const results: Result[] = [];

function nearestRank(values: number[], percentile: number) {
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((percentile / 100) * sorted.length));
  return sorted[rank - 1]!;
}

function summarize(scenario: string, samples: Sample[]): Result {
  const ms = samples.map((s) => s.ms);
  const commits = samples.map((s) => s.commits);
  return {
    scenario,
    status: 'measured',
    samples: samples.length,
    medianMs: nearestRank(ms, 50),
    p95Ms: nearestRank(ms, 95),
    medianCommits: nearestRank(commits, 50),
    p95Commits: nearestRank(commits, 95),
  };
}

async function installCommitCounter(page: Page) {
  await page.addInitScript(() => {
    const state = { commits: 0 };
    Object.assign(window, { __perfCommits: state });
    const hook = {
      supportsFiber: true,
      renderers: new Map(),
      inject: () => 1,
      onCommitFiberRoot: () => {
        state.commits += 1;
      },
      onCommitFiberUnmount: () => {},
      onPostCommitFiberRoot: () => {},
      checkDCE: () => {},
    };
    Object.defineProperty(window, '__REACT_DEVTOOLS_GLOBAL_HOOK__', {
      configurable: true,
      value: hook,
    });
  });
}

const commits = (page: Page) =>
  page.evaluate(() => (window as unknown as { __perfCommits: { commits: number } }).__perfCommits.commits);

/** Same synthetic data for both commits (the baseline simply never asks). */
async function stubData(page: Page) {
  if (TARGET === 'fixture') return; // The fixture fences its own network.
  const today = (h: number) => {
    const d = new Date();
    d.setHours(h, 0, 0, 0);
    return d.toISOString();
  };
  const task = (id: string) => ({
    id,
    name: `Synthetic task ${id}`,
    end_date: null,
    list: { id: 'list-open', name: 'Launch', status: 'active', board: { id: 'board-1', ws_id: 'ws-1', name: 'Website' } },
  });
  await page.route('**/api/v1/users/me/tasks**', (r) =>
    r.fulfill({ json: { overdue: [task('a')], today: [task('b')], upcoming: [task('c')], completed: [] } })
  );
  await page.route('**/api/v1/workspaces/*/calendar/events**', (r) =>
    r.fulfill({ json: { data: [{ id: 'e1', title: 'Sync', start_at: today(21), end_at: today(22) }], count: 1 } })
  );
  await page.route('**/time-tracking/**', (r) => {
    const url = r.request().url();
    if (url.includes('type=running')) return r.fulfill({ json: { session: { id: 's1', title: 'Focus', start_time: today(9) } } });
    if (url.includes('type=stats')) return r.fulfill({ json: { stats: { todayTime: 3600, weekTime: 7200, monthTime: 0, streak: 0 } } });
    if (url.includes('/goals')) return r.fulfill({ json: { goals: [] } });
    if (url.includes('/stats/period')) return r.fulfill({ json: { dailyBreakdown: [] } });
    if (r.request().method() === 'PATCH') return r.fulfill({ json: { session: null } });
    return r.continue();
  });
  await page.route('**/task-boards/*/lists', (r) =>
    r.fulfill({ json: { lists: [{ id: 'list-done', status: 'done' }] } })
  );
  await page.route('**/api/v1/workspaces/*/tasks/*', (r) =>
    r.request().method() === 'PUT' ? r.fulfill({ json: { task: {} } }) : r.continue()
  );
}

/** Mira composer present in both commits (the d head marks its block). */
const composer = (page: Page) => page.locator('textarea').first();
const isHead = async (page: Page) =>
  (await page.locator('[data-dashboard-layout]').count()) > 0;

test.describe.configure({ mode: 'serial' });
test.setTimeout(10 * 60_000);

test.beforeEach(async ({ page }) => {
  await installCommitCounter(page);
  await stubData(page);
  await page.setViewportSize({ width: 1440, height: 900 });
});

test('load: navigation to an interactive Mira composer', async ({ page }) => {
  const samples: Sample[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const start = Date.now();
    await page.goto(PATH, { waitUntil: 'domcontentloaded' });
    await expect(composer(page)).toBeVisible({ timeout: 60_000 });
    samples.push({ ms: Date.now() - start, commits: await commits(page) });
  }
  results.push(summarize('load-to-composer', samples));
});

test('type: composer keystroke to painted value (never sends)', async ({ page }) => {
  await page.goto(PATH);
  await expect(composer(page)).toBeVisible({ timeout: 60_000 });
  const samples: Sample[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const before = await commits(page);
    const start = await page.evaluate(() => performance.now());
    await composer(page).press('a');
    const end = await page.evaluate(
      () => new Promise<number>((resolve) => requestAnimationFrame(() => resolve(performance.now())))
    );
    samples.push({ ms: end - start, commits: (await commits(page)) - before });
  }
  await composer(page).fill('');
  results.push(summarize('composer-keystroke', samples));
});

test('resize: 1440 to 728 to 1440 layout settle', async ({ page }) => {
  await page.goto(PATH);
  await expect(composer(page)).toBeVisible({ timeout: 60_000 });
  const samples: Sample[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    const before = await commits(page);
    const start = await page.evaluate(() => performance.now());
    await page.setViewportSize({ width: 728, height: 900 });
    await page.setViewportSize({ width: 1440, height: 900 });
    const end = await page.evaluate(
      () => new Promise<number>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(performance.now()))))
    );
    samples.push({ ms: end - start, commits: (await commits(page)) - before });
  }
  results.push(summarize('resize-settle', samples));
});

const HEAD_ONLY = 'The baseline home is Mira-only; this card interaction does not exist at 9a687b51, so no before value exists.';

test('complete: task row leaves the card (d head only)', async ({ page }) => {
  await page.goto(PATH);
  await expect(composer(page)).toBeVisible({ timeout: 60_000 });
  if (!(await isHead(page))) {
    results.push({ scenario: 'task-complete', status: 'not-applicable', reason: HEAD_ONLY });
    return;
  }
  const samples: Sample[] = [];
  for (let i = 0; i < SAMPLES; i++) {
    await page.goto(PATH);
    const button = page.locator('[data-dashboard-card="tasks"] button[aria-label]').first();
    await expect(button).toBeVisible({ timeout: 30_000 });
    const rows = page.locator('[data-dashboard-card="tasks"] li');
    const count = await rows.count();
    const before = await commits(page);
    const start = Date.now();
    await button.click();
    await expect(rows).toHaveCount(count - 1);
    samples.push({ ms: Date.now() - start, commits: (await commits(page)) - before });
  }
  results.push(summarize('task-complete', samples));
});

test('timer: pause request round trip (d head only)', async ({ page }) => {
  await page.goto(PATH);
  await expect(composer(page)).toBeVisible({ timeout: 60_000 });
  if (!(await isHead(page))) {
    results.push({ scenario: 'timer-pause', status: 'not-applicable', reason: HEAD_ONLY });
    return;
  }
  const samples: Sample[] = [];
  const pause = page.locator('[data-dashboard-card="time"] button').filter({ hasText: /pause|tạm dừng/i });
  for (let i = 0; i < SAMPLES; i++) {
    await expect(pause).toBeEnabled({ timeout: 30_000 });
    const before = await commits(page);
    const start = Date.now();
    await Promise.all([
      page.waitForResponse((r) => r.request().method() === 'PATCH' && r.url().includes('/time-tracking/sessions/')),
      pause.click(),
    ]);
    await expect(pause).toBeEnabled();
    samples.push({ ms: Date.now() - start, commits: (await commits(page)) - before });
  }
  results.push(summarize('timer-pause', samples));
});

test.afterAll(() => {
  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(
    OUTPUT,
    `${JSON.stringify({ label: LABEL, target: TARGET, path: PATH, samples: SAMPLES, results }, null, 2)}\n`
  );
});
