import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { afterEach, expect, it } from 'vitest';
import { queuedResourceCommand, resourceQueueStatus } from './resources-queue';
import {
  planTurboSummary,
  reportTurboSummary,
  snapshotTurboSummaries,
} from './resources-turbo-summary';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'ttr-summary-lifecycle-'));
  dirs.push(root);
  await mkdir(join(root, '.git'));
  await mkdir(join(root, '.turbo', 'runs'), { recursive: true });
  await writeFile(join(root, 'turbo.json'), '{}');
  return root;
}
async function until(check: () => Promise<boolean>) {
  const end = Date.now() + 3_000;
  while (!(await check())) {
    if (Date.now() > end) throw new Error('fixture did not reach its barrier');
    await sleep(10);
  }
}

it('releases the lane while an escaped child still holds inherited stdout', async () => {
  const root = await fixture();
  const home = join(root, 'resources');
  const pidPath = join(root, 'escaped.pid');
  const script = `const {spawn}=require('node:child_process'); const fs=require('node:fs'); const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:'inherit'}); child.once('spawn',()=>{fs.writeFileSync(${JSON.stringify(pidPath)},String(child.pid));child.unref();process.exit(0);});`;
  let finished = false;
  const job = queuedResourceCommand(
    home,
    process.execPath,
    ['-e', script],
    { ...process.env, TTR_RESOURCES_IGNORE_DISK: '1' },
    true,
    1,
    undefined,
    undefined,
    undefined,
    async () => {}
  ).then((code) => {
    finished = true;
    return code;
  });
  let escaped: number | undefined;
  try {
    await until(async () => {
      try {
        escaped = Number(await readFile(pidPath, 'utf8'));
        return true;
      } catch {
        return false;
      }
    });
    await Promise.race([job, sleep(1_000)]);
    expect(finished).toBe(true);
    expect((await resourceQueueStatus(home)).occupied).toBe(0);
    expect(escaped).toBeGreaterThan(0);
    expect(() => process.kill(escaped!, 0)).not.toThrow();
    expect(await job).toBe(0);
  } finally {
    if (escaped) {
      try {
        process.kill(escaped, 'SIGTERM');
      } catch {
        /* Already exited. */
      }
    }
    await job;
  }
});

it('snapshots after queue admission and before the command writes its summary', async () => {
  const root = await fixture();
  const runs = join(root, '.turbo', 'runs');
  const plan = planTurboSummary('turbo', ['run', 'test'], root);
  const sample = { tasks: [{ cache: { status: 'HIT' } }] };
  const script = `require('node:fs').writeFileSync(${JSON.stringify(join(runs, 'mine.json'))}, ${JSON.stringify(JSON.stringify({ id: 'mine', ...sample }))});`;
  expect(
    await queuedResourceCommand(
      join(root, 'resources'),
      process.execPath,
      ['-e', script],
      { ...process.env, TTR_RESOURCES_IGNORE_DISK: undefined },
      true,
      1,
      undefined,
      undefined,
      async () => {
        await writeFile(
          join(runs, 'queued.json'),
          JSON.stringify({ id: 'queued', ...sample })
        );
        return { admit: true, freeGiB: 100 };
      },
      async () => snapshotTurboSummaries(plan)
    )
  ).toBe(0);
  const lines: string[] = [];
  await reportTurboSummary(plan, (line) => lines.push(line));
  expect(lines).toHaveLength(1);
  expect(await readdir(runs)).toEqual(['queued.json']);
});

it('preserves another run summary when queued and cancelled before spawn', async () => {
  const root = await fixture();
  const home = join(root, 'resources');
  const plan = planTurboSummary('turbo', ['run', 'test'], root);
  const other = join(root, '.turbo', 'runs', 'other.json');
  let probing = false;
  let release!: () => void;
  let spawned = false;
  const job = queuedResourceCommand(
    home,
    process.execPath,
    ['-e', ''],
    { ...process.env, TTR_RESOURCES_IGNORE_DISK: undefined },
    true,
    1,
    undefined,
    undefined,
    async () => {
      probing = true;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return { admit: false, unknown: false, reason: 'fixture waiting' };
    },
    async () => {
      spawned = true;
      snapshotTurboSummaries(plan);
    }
  );
  try {
    await until(async () => probing);
    await writeFile(
      other,
      JSON.stringify({ id: 'other', tasks: [{ cache: { status: 'HIT' } }] })
    );
    process.emit('SIGINT');
    release();
    expect(await job).toBe(130);
    const lines: string[] = [];
    await reportTurboSummary(plan, (line) => lines.push(line));
    expect(spawned).toBe(false);
    expect(lines).toEqual([]);
    expect(await readdir(join(root, '.turbo', 'runs'))).toEqual(['other.json']);
  } finally {
    release?.();
    await job;
  }
});
