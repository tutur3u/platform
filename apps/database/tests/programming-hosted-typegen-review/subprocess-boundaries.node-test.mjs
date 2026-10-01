import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import test from 'node:test';
import {
  CliEnvironmentFailure,
  createSyntheticCliContext,
} from './cli-environment.mjs';
import { runHostedCommand } from './hosted-command.mjs';
import { runCliProbe } from './native-cli.mjs';
import { runHostedHelper } from './proposal.mjs';

async function fixture(t) {
  const base = await mkdtemp(path.join(os.tmpdir(), 'subprocess-boundary-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const project = path.join(base, 'project');
  await mkdir(project);
  const context = createSyntheticCliContext({
    root: path.join(base, 'private'),
    nativeBinary: process.execPath,
    temporaryRoot: os.tmpdir(),
    workdir: project,
  });
  return { base, project, context };
}

for (const mode of ['--resume', '--cleanup']) {
  test(`actual synthetic helper cwd matches admission for ${mode}`, async (t) => {
    const { base, project, context } = await fixture(t);
    const helper = path.join(base, 'helper.mjs');
    await writeFile(
      helper,
      `import {writeFileSync} from 'node:fs';writeFileSync('observed.json',JSON.stringify({cwd:process.cwd(),workdir:process.env.SUPABASE_WORKDIR,mode:process.argv[2]}));`
    );
    await runHostedHelper(
      process.execPath,
      [helper, mode, project],
      {
        timeoutMs: 2000,
        cwd: base,
      },
      { nativeBinary: process.execPath, context: () => context }
    );
    assert.deepEqual(
      JSON.parse(await readFile(path.join(project, 'observed.json'), 'utf8')),
      {
        cwd: context.cwd,
        workdir: context.cwd,
        mode,
      }
    );
    assert.equal(existsSync(path.join(base, 'observed.json')), false);
  });
}

test('generic cwd overrides fail before execution outside the admitted directory', async (t) => {
  const { base, context } = await fixture(t);
  assert.throws(
    () =>
      runHostedCommand(process.execPath, [], {
        context,
        cwd: base,
        execute: () => assert.fail('unadmitted cwd executed'),
      }),
    CliEnvironmentFailure
  );
});

for (const mode of ['timeout', 'interruption', 'output-limit']) {
  test(`probe settles on ${mode} despite an escaped descendant retaining both pipes`, {
    timeout: 4000,
  }, async (t) => {
    const { base, context } = await fixture(t);
    const helper = path.join(base, 'probe.mjs');
    const marker = path.join(base, 'escaped-pid');
    // Synthetic Node only: escaped process has its own group and retains pipes.
    // The test owns and kills it explicitly; proposal does not claim to kill escapees.
    await writeFile(
      helper,
      `import {spawn} from 'node:child_process';import {writeFileSync} from 'node:fs';const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,stdio:['ignore',1,2]});child.once('spawn',()=>{writeFileSync(process.argv[2],String(child.pid));${mode === 'output-limit' ? "process.stderr.write('x'.repeat(256));" : ''}setInterval(()=>{},1000);});`
    );
    const signals = new EventEmitter();
    let interrupt;
    let safety;
    try {
      const started = performance.now();
      const pending = runCliProbe(process.execPath, [helper, marker], {
        ...context,
        phase: 'cli-version',
        timeoutMs: 500,
        maxOutputBytes: 128,
        signalSource: signals,
      });
      if (mode === 'interruption')
        interrupt = setInterval(() => {
          if (existsSync(marker)) signals.emit('SIGTERM');
        }, 10);
      await assert.rejects(
        Promise.race([
          pending,
          new Promise((_, reject) => {
            safety = setTimeout(
              () => reject(new Error('probe did not settle')),
              1500
            );
          }),
        ]),
        (error) =>
          error.outcome === (mode === 'interruption' ? 'interrupted' : mode)
      );
      assert(
        performance.now() - started < 1500,
        'probe exceeded bounded settlement'
      );
      assert(existsSync(marker), 'escaped fixture did not start');
      process.kill(Number(readFileSync(marker, 'utf8')), 0);
      assert.equal(signals.listenerCount('SIGINT'), 0);
      assert.equal(signals.listenerCount('SIGTERM'), 0);
    } finally {
      clearInterval(interrupt);
      clearTimeout(safety);
      if (existsSync(marker)) {
        const pid = Number(readFileSync(marker, 'utf8'));
        try {
          process.kill(-pid, 'SIGKILL');
        } catch (error) {
          assert.equal(error.code, 'ESRCH');
        }
      }
    }
  });
}
