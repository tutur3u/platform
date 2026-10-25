import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resourcesHelp, runResourcesCommand } from './resources';
import { maxResourceLanes } from './resources-config';

// The help text and the setup parser must state and enforce the implemented
// lane ceiling (maxResourceLanes), never a stale literal.
const dirs: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

describe('lane limit in help and setup', () => {
  it('help states the implemented lane ceiling', () => {
    const help = resourcesHelp();
    expect(maxResourceLanes).toBe(16);
    expect(help).toContain(`--lanes <1..${maxResourceLanes}>`);
    expect(help).toContain(`--max-lanes <1..${maxResourceLanes}>`);
    expect(help).toContain(`at most ${maxResourceLanes})`);
    expect(help).not.toMatch(/1\.\.8\b|at most 8\b/u);
    // Option descriptions stay in one column.
    const columns = help
      .split('\n')
      .filter((line) => /^ {2}--(lanes|max-lanes|workers|shell) /u.test(line))
      .map((line) => {
        const gap = / {2,}(?=\S)/u.exec(line.slice(2));
        return gap ? 2 + gap.index + gap[0].length : -1;
      });
    expect(new Set(columns).size).toBe(1);
  });

  async function setup(lanes: string) {
    const home = await realpath(
      await mkdtemp(join(tmpdir(), 'ttr-lane-limit-'))
    );
    dirs.push(home);
    const out: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      out.push(String(chunk));
      return true;
    });
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const previous = process.env.TTR_RESOURCES_HOME;
    process.env.TTR_RESOURCES_HOME = home;
    try {
      await runResourcesCommand([
        'setup',
        '--root',
        home,
        '--shell',
        'none',
        '--lanes',
        lanes,
        '--max-lanes',
        lanes,
        '--workers',
        '1',
        '--dry-run',
        '--json',
      ]);
    } finally {
      if (previous === undefined) delete process.env.TTR_RESOURCES_HOME;
      else process.env.TTR_RESOURCES_HOME = previous;
    }
    return JSON.parse(out.join('')) as {
      config: { validationLanes: number; maxValidationLanes: number };
    };
  }

  it('setup accepts every lane count up to the ceiling', async () => {
    for (const lanes of ['1', '9', '12', String(maxResourceLanes)]) {
      const plan = await setup(lanes);
      expect(plan.config.validationLanes).toBe(Number(lanes));
      expect(plan.config.maxValidationLanes).toBe(Number(lanes));
    }
  });

  it.each(['0', String(maxResourceLanes + 1), '08', '2.5', 'many'])(
    'setup rejects --lanes %s with the implemented bound',
    async (lanes) => {
      await expect(setup(lanes)).rejects.toThrow(
        `--lanes must be an integer from 1 to ${maxResourceLanes}.`
      );
    }
  );
});
