import {
  mkdir,
  mkdtemp,
  readdir,
  rm,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { spawnResourceCommand } from './resources-queue';
import {
  formatDuration,
  planTurboSummary,
  recordTurboSummaryOutput,
  reportTurboSummary,
  summarizeTurboRun,
} from './resources-turbo-summary';

const roots: string[] = [];

async function turboRoot() {
  const root = await mkdtemp(join(tmpdir(), 'ttr-turbo-summary-'));
  roots.push(root);
  await writeFile(join(root, 'turbo.json'), '{}');
  await mkdir(join(root, '.git'));
  await mkdir(join(root, '.turbo', 'runs'), { recursive: true });
  return root;
}

const hitAndMiss = {
  tasks: [
    {
      cache: { status: 'HIT', local: true, remote: false, timeSaved: 1_004 },
      execution: { startTime: 10, endTime: 12 },
    },
    {
      cache: { status: 'HIT', local: false, remote: true, timeSaved: 61_000 },
    },
    {
      cache: { status: 'MISS', local: false, remote: false, timeSaved: 0 },
      execution: { startTime: 100, endTime: 2_600 },
    },
  ],
};

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe('planTurboSummary', () => {
  it('adds --summarize after run for direct and script turbo invocations', async () => {
    const root = await turboRoot();
    expect(planTurboSummary('turbo', ['run', 'test'], root, 1).args).toEqual([
      'run',
      '--summarize=true',
      'test',
    ]);
    expect(
      planTurboSummary(
        'bun',
        ['turbo:local', 'run', 'type-check', '--affected', '--', '-u'],
        root
      )
    ).toMatchObject({
      args: [
        'turbo:local',
        'run',
        '--summarize=true',
        'type-check',
        '--affected',
        '--',
        '-u',
      ],
      owned: true,
      root,
    });
    expect(
      planTurboSummary('/usr/bin/bunx', ['turbo', 'run', 'build'], root).args
    ).toContain('--summarize=true');
    expect(
      planTurboSummary('bun', ['x', 'turbo', 'run', 'build'], root).args
    ).toContain('--summarize=true');
  });

  it('leaves other commands, dry runs and missing roots untouched', async () => {
    const root = await turboRoot();
    for (const [name, args] of [
      ['bun', ['run', 'test']],
      ['vitest', ['run']],
      ['turbo', ['ls', '--affected']],
      ['turbo', ['run', 'test', '--dry=json']],
      ['turbo', ['run', 'test', '--graph']],
      ['bun', ['x', 'tsc', '--', 'turbo', 'run']],
      ['bun', ['scripts/check.js', 'turbo', 'run']],
    ] as const) {
      const plan = planTurboSummary(name, [...args], root);
      expect(plan.args).toEqual(args);
      expect(plan.owned).toBe(false);
    }
    const outside = await mkdtemp(join(tmpdir(), 'ttr-no-turbo-'));
    roots.push(outside);
    expect(planTurboSummary('turbo', ['run', 'test'], outside).root).toBe(
      undefined
    );
  });

  it('keeps a user-requested summary and does not own it', async () => {
    const root = await turboRoot();
    const plan = planTurboSummary(
      'turbo',
      ['run', 'test', '--summarize'],
      root
    );
    expect(plan.args).toEqual(['run', 'test', '--summarize']);
    expect(plan).toMatchObject({ owned: false, root });
  });
});

describe('summarizeTurboRun', () => {
  it('counts local and remote hits, executed time and saved time', () => {
    expect(summarizeTurboRun(hitAndMiss)).toEqual({
      total: 3,
      cached: 2,
      local: 1,
      remote: 1,
      executed: 1,
      executedMs: 2_500,
      savedMs: 62_004,
    });
    expect(formatDuration(62_004)).toBe('1m02s');
    expect(formatDuration(2_500)).toBe('2.5s');
  });
});

describe('reportTurboSummary', () => {
  it('never reports or removes a pre-existing summary within the timestamp allowance', async () => {
    const root = await turboRoot();
    const path = join(root, '.turbo', 'runs', 'previous.json');
    await writeFile(path, JSON.stringify(hitAndMiss));
    const plan = planTurboSummary('turbo', ['run', 'test'], root, Date.now());
    const lines: string[] = [];
    await reportTurboSummary(plan, (line) => lines.push(line));
    expect(lines).toEqual([]);
    expect(await readdir(join(root, '.turbo', 'runs'))).toEqual([
      'previous.json',
    ]);
  });

  it('reports and removes the summary it requested', async () => {
    const root = await turboRoot();
    const plan = planTurboSummary('turbo', ['run', 'test'], root, Date.now());
    const runs = join(root, '.turbo', 'runs');
    await writeFile(
      join(runs, 'a.json'),
      JSON.stringify({ id: 'a', ...hitAndMiss })
    );
    recordTurboSummaryOutput(
      plan,
      'stdout',
      Buffer.from(` Summary: ${join(runs, 'a.json')}\n`)
    );
    const lines: string[] = [];
    await reportTurboSummary(plan, (line) => lines.push(line));
    expect(lines).toEqual([
      '[ttr resources] turbo cache: 2/3 tasks cached (local 1, remote 1); 1 executed in 2.5s; saved ~1m02s\n',
    ]);
    expect(await readdir(runs)).toEqual([]);
  });

  it('keeps user summaries, ignores older runs and skips ambiguous runs', async () => {
    const root = await turboRoot();
    const runs = join(root, '.turbo', 'runs');
    const old = join(runs, 'old.json');
    await writeFile(old, JSON.stringify(hitAndMiss));
    const past = new Date(Date.now() - 60_000);
    await utimes(old, past, past);

    const userPlan = planTurboSummary(
      'turbo',
      ['run', 'test', '--summarize'],
      root,
      Date.now()
    );
    await writeFile(
      join(runs, 'mine.json'),
      JSON.stringify({ id: 'mine', ...hitAndMiss })
    );
    recordTurboSummaryOutput(
      userPlan,
      'stdout',
      Buffer.from(` Summary: ${join(runs, 'mine.json')}\n`)
    );
    const lines: string[] = [];
    await reportTurboSummary(userPlan, (line) => lines.push(line));
    expect(lines).toHaveLength(1);
    expect((await readdir(runs)).sort()).toEqual(['mine.json', 'old.json']);

    const ownedPlan = planTurboSummary(
      'turbo',
      ['run', 'test'],
      root,
      Date.now()
    );
    await writeFile(join(runs, 'other.json'), JSON.stringify(hitAndMiss));
    await reportTurboSummary(ownedPlan, (line) => lines.push(line));
    expect(lines).toHaveLength(1);
    expect((await readdir(runs)).sort()).toEqual([
      'mine.json',
      'old.json',
      'other.json',
    ]);
  });

  it('reads only the summary named by this process, even with concurrent files', async () => {
    const root = await turboRoot();
    const plan = planTurboSummary('turbo', ['run', 'test'], root);
    const runs = join(root, '.turbo', 'runs');
    await writeFile(
      join(runs, 'other.json'),
      JSON.stringify({ id: 'other', ...hitAndMiss })
    );
    const lines: string[] = [];
    await reportTurboSummary(plan, (line) => lines.push(line));
    expect(lines).toEqual([]);
    await writeFile(
      join(runs, 'mine.json'),
      JSON.stringify({ id: 'mine', ...hitAndMiss })
    );
    recordTurboSummaryOutput(
      plan,
      'stdout',
      Buffer.from(` Summary: ${join(runs, 'mine')}`)
    );
    recordTurboSummaryOutput(plan, 'stdout', Buffer.from('.json\n'));
    await reportTurboSummary(plan, (line) => lines.push(line));
    expect(lines).toHaveLength(1);
    expect(await readdir(runs)).toEqual(['other.json']);
  });

  it('observes the spawned command output before reading its summary', async () => {
    const root = await turboRoot();
    const plan = planTurboSummary('turbo', ['run', 'test'], root);
    const path = join(root, '.turbo', 'runs', 'spawned.json');
    const script = `require('node:fs').writeFileSync(${JSON.stringify(path)}, ${JSON.stringify(JSON.stringify({ id: 'spawned', ...hitAndMiss }))}); process.stdout.write(${JSON.stringify(` Summary: ${path}\n`)});`;
    expect(
      await spawnResourceCommand(
        process.execPath,
        ['-e', script],
        process.env,
        false,
        undefined,
        (stream, chunk) => recordTurboSummaryOutput(plan, stream, chunk)
      )
    ).toBe(0);
    const lines: string[] = [];
    await reportTurboSummary(plan, (line) => lines.push(line));
    expect(lines).toHaveLength(1);
    expect(await readdir(join(root, '.turbo', 'runs'))).toEqual([]);
  });

  it('never throws for missing or partial summaries', async () => {
    const root = await turboRoot();
    const plan = planTurboSummary('turbo', ['run', 'test'], root, Date.now());
    await writeFile(join(root, '.turbo', 'runs', 'partial.json'), '{"tasks":');
    await expect(reportTurboSummary(plan, () => {})).resolves.toBeUndefined();
    await rm(join(root, '.turbo'), { recursive: true });
    await expect(reportTurboSummary(plan, () => {})).resolves.toBeUndefined();
  });
});
