import { spawn } from 'node:child_process';
import { chmod, mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { commandTool, isHeavyCommand } from './resources-command';
import { resourceQueueStatus } from './resources-queue';
import {
  bun,
  privateFixtures,
  processTimeout,
  realNode,
} from './resources-test-fixtures';

vi.mock('node:os', async (original) => ({
  ...(await original<typeof import('node:os')>()),
  totalmem: () => 24 * 1024 ** 3,
  availableParallelism: () => 10,
}));
const fixtures = privateFixtures(true);
const { home, launch } = fixtures;
afterEach(() => fixtures.cleanup());

describe('the program is the first positional argument', () => {
  it.each([
    // ttr's own launcher through the bun shim: ttr, never vitest.
    [
      'bun',
      [
        '/home/u/.bun/bin/ttr',
        'resources',
        'run',
        '--',
        'bunx',
        'vitest',
        'run',
      ],
      'ttr',
      false,
    ],
    [
      'bun',
      ['--smol', '/opt/sdk/dist/cli/resources-entry.js', 'run', '--', 'vitest'],
      'ttr',
      false,
    ],
    ['node', ['script.js', 'vitest', 'run'], 'node', false],
    ['node', ['-r', 'vitest', 'script.js'], 'ambiguous', true],
    // Real tool entries stay heavy.
    [
      'node',
      ['/repo/node_modules/vitest/vitest.mjs', 'run', 'src'],
      'vitest',
      true,
    ],
    ['bunx', ['vitest', 'run'], 'vitest', true],
    ['bun', ['x', 'vitest', 'run'], 'vitest', true],
    ['bun', ['run', '--filter', 'web', 'test'], 'bun', true],
    ['npx', ['--yes', 'turbo', 'run', 'test'], 'turbo', true],
  ] as const)('%s %j runs %s (heavy %s)', (name, args, tool, heavy) => {
    expect(commandTool(name, [...args]).tool).toBe(tool);
    expect(isHeavyCommand(name, [...args])).toBe(heavy);
  });
});

describe('nested shim chain from skr-studio', { timeout: 60_000 }, () => {
  it('admits ttr → bunx → #!/usr/bin/env node vitest once, with the shims on PATH', async () => {
    const path = await home(1);
    // Materialize the managed shims (bun, bunx, node, ...) in <home>/bin.
    const warm = await launch(path, ['run', '--', 'echo', 'warm']).done;
    expect(warm.code, warm.err).toBe(0);
    const loader = join(path, 'fixture-launch-0.ts');
    const bin = join(path, 'bin');
    // `ttr` is a `#!/usr/bin/env bun` launcher, so with the shims first on
    // PATH it starts through the bun shim (hop 2 of the incident).
    const tools = join(path, 'tools');
    await mkdir(tools);
    await symlink(bun, join(tools, 'bun'));
    await symlink(bun, join(tools, 'bunx'));
    await symlink(realNode, join(tools, 'node'));
    const ttr = join(tools, 'ttr');
    await writeFile(
      ttr,
      `#!/usr/bin/env bun\nimport(${JSON.stringify(loader)}).catch((error)=>{console.error(error);process.exit(1)});\n`
    );
    await chmod(ttr, 0o755);
    // A package whose vitest bin is `#!/usr/bin/env node`: bunx honours the
    // shebang, so it starts through the node shim (hop 3).
    const pkg = join(path, 'pkg');
    const vitestDir = join(pkg, 'node_modules', 'vitest');
    await mkdir(vitestDir, { recursive: true });
    await mkdir(join(pkg, 'node_modules', '.bin'), { recursive: true });
    await writeFile(
      join(pkg, 'package.json'),
      '{"name":"pkg","private":true}\n'
    );
    await writeFile(
      join(vitestDir, 'package.json'),
      '{"name":"vitest","version":"0.0.0","bin":{"vitest":"vitest.mjs"}}\n'
    );
    const ran = join(path, 'vitest.ran.json');
    const entry = join(vitestDir, 'vitest.mjs');
    await writeFile(
      entry,
      `#!/usr/bin/env node
import {readFileSync,writeFileSync} from 'node:fs';
const owner=JSON.parse(readFileSync(${JSON.stringify(join(path, 'slots', '0', 'owner.json'))},'utf8'));
writeFileSync(${JSON.stringify(ran)},JSON.stringify({argv:process.argv.slice(2),ownerTool:owner.tool,ownerCommand:owner.command,admitted:process.env.TTR_RESOURCES_ADMITTED===owner.token}));
`
    );
    await chmod(entry, 0o755);
    await symlink(
      '../vitest/vitest.mjs',
      join(pkg, 'node_modules', '.bin', 'vitest')
    );
    const child = spawn(
      '/bin/sh',
      [
        '-c',
        `export PATH=${JSON.stringify(bin)}:"$PATH"; cd ${JSON.stringify(pkg)} && ttr run -- bunx vitest run src --maxWorkers=4`,
      ],
      {
        env: {
          ...process.env,
          PATH: [tools, '/usr/bin', '/bin'].join(delimiter),
          TTR_RESOURCES_HOME: path,
          TTR_RESOURCES_IGNORE_DISK: '1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
    fixtures.children.push(child);
    let err = '';
    child.stderr.on('data', (chunk) => {
      err += chunk;
    });
    // A deadlock (the node shim queueing behind its own admitted ancestor)
    // never exits; bound it so the failure is explicit.
    const code = await Promise.race([
      new Promise<number | null>((done) => child.once('exit', done)),
      new Promise<'deadlock'>((done) =>
        setTimeout(() => done('deadlock'), processTimeout * 2)
      ),
    ]);
    expect(code, err).toBe(0);
    const result = JSON.parse(await readFile(ran, 'utf8')) as {
      argv: string[];
      ownerTool: string;
      ownerCommand: string;
      admitted: boolean;
    };
    // The lane is held by the explicit `ttr run` (bunx vitest), not by the
    // bun shim that started ttr, and vitest ran inside that admission.
    expect(result.ownerTool).toBe('bunx');
    expect(result.ownerCommand).toMatch(/^bunx vitest run src/u);
    expect(result.admitted).toBe(true);
    expect(result.argv.slice(0, 2)).toEqual(['run', 'src']);
    // Exactly one admission: nothing queued behind its own ancestor.
    expect(err.match(/queued PID/gu) ?? []).toHaveLength(0);
    expect((await resourceQueueStatus(path)).waiting).toHaveLength(0);
  });
});
