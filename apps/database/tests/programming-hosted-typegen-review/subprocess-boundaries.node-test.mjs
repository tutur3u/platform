import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
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

function fixturePid(text, token) {
  try {
    const record = JSON.parse(text);
    return record.token === token &&
      Number.isSafeInteger(record.pid) &&
      record.pid > 1 &&
      record.pid !== process.pid
      ? record.pid
      : undefined;
  } catch {
    return undefined;
  }
}
test('fixture PID admission rejects empty, zero, noninteger and unrelated records', () => {
  for (const text of [
    '',
    '0',
    '{"pid":0,"token":"owned"}',
    '{"pid":-1,"token":"owned"}',
    '{"pid":1.5,"token":"owned"}',
    '{"pid":123,"token":"unrelated"}',
    JSON.stringify({ pid: process.pid, token: 'owned' }),
  ])
    assert.equal(fixturePid(text, 'owned'), undefined);
  assert.equal(fixturePid('{"pid":123,"token":"owned"}', 'owned'), 123);
});
for (const runner of ['probe', 'command'])
  for (const mode of ['timeout', 'interruption', 'output-limit']) {
    if (runner === 'command' && mode === 'interruption') continue;
    test(`${runner} settles on ${mode} despite an escaped descendant retaining both pipes`, {
      timeout: 5000,
      concurrency: false,
    }, async (t) => {
      const { base, context } = await fixture(t);
      const helper = path.join(base, 'probe.mjs');
      const marker = path.join(base, 'escaped-pid');
      const token = randomUUID();
      const readPid = () =>
        existsSync(marker)
          ? fixturePid(readFileSync(marker, 'utf8'), token)
          : undefined;
      // Synthetic Node only: escaped process has its own group and retains pipes.
      // The test owns and kills it explicitly; proposal does not claim to kill escapees.
      await writeFile(
        helper,
        `import {spawn} from 'node:child_process';import {writeFileSync,renameSync} from 'node:fs';process.on('SIGTERM',()=>{});const child=spawn(process.execPath,['-e','setTimeout(()=>process.exit(0),6000)'],{detached:true,stdio:['ignore',1,2]});child.once('spawn',()=>{writeFileSync(process.argv[2]+'.tmp',JSON.stringify({pid:child.pid,token:${JSON.stringify(token)}}));renameSync(process.argv[2]+'.tmp',process.argv[2]);${mode === 'output-limit' ? "process.stderr.write('x'.repeat(256));" : ''}setInterval(()=>{},1000);});`
      );
      const signals = new EventEmitter();
      const signalSource = runner === 'command' ? process : signals;
      const events = ['SIGINT', 'SIGTERM'];
      const baseline = new Map(
        events.map((event) => [event, signalSource.rawListeners(event)])
      );
      const ownedHandlers = new Map();
      let interrupt;
      let safety;
      try {
        const started = performance.now();
        const pending =
          runner === 'command'
            ? runHostedCommand(process.execPath, [helper, marker], {
                context,
                timeout: mode === 'timeout' ? 500 : 2000,
                maxBuffer: 128,
              })
            : runCliProbe(process.execPath, [helper, marker], {
                ...context,
                phase: 'cli-version',
                timeoutMs: mode === 'timeout' ? 500 : 2000,
                maxOutputBytes: 128,
                signalSource: signals,
              });
        for (const event of events) {
          ownedHandlers.set(
            event,
            signalSource
              .rawListeners(event)
              .filter((handler) => !baseline.get(event).includes(handler))
          );
        }
        if (mode === 'interruption')
          interrupt = setInterval(() => {
            if (readPid()) signals.emit('SIGTERM');
          }, 10);
        await assert.rejects(
          Promise.race([
            pending,
            new Promise((_, reject) => {
              safety = setTimeout(
                () => reject(new Error('probe did not settle')),
                3000
              );
            }),
          ]),
          (error) =>
            error.outcome === (mode === 'interruption' ? 'interrupted' : mode)
        );
        assert(
          performance.now() - started < (mode === 'timeout' ? 1500 : 3000),
          'probe exceeded bounded settlement'
        );
        assert(existsSync(marker), 'escaped fixture did not start');
        const pid = readPid();
        assert(pid, 'owned PID record missing');
        process.kill(pid, 0);
        for (const event of events) {
          assert.equal(
            ownedHandlers.get(event).length,
            1,
            'actual emitter did not register the owned interrupt handler'
          );
          assert.deepEqual(
            signalSource.rawListeners(event),
            baseline.get(event),
            'actual emitter retained an owned interrupt handler'
          );
        }
      } finally {
        clearInterval(interrupt);
        clearTimeout(safety);
        // Restore only handlers introduced by this invocation; preserve pre-existing listeners.
        for (const [event, handlers] of ownedHandlers) {
          for (const handler of handlers) signalSource.off(event, handler);
        }
        const pid = readPid();
        if (pid) {
          try {
            process.kill(-pid, 'SIGKILL');
          } catch (error) {
            assert.equal(error.code, 'ESRCH');
          }
        }
      }
    });
  }
