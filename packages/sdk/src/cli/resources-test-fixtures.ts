import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import {
  chmod,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { beforeEach } from 'vitest';
import { realExecutable } from './resources-command';
import { atomicJson, defaultResourceConfig } from './resources-config';
import { processGroupAlive } from './resources-slots';

export const bunRunSeparatorExpected = [
  '--no-install',
  'run',
  'turbo',
  '--',
  'run',
  'test',
  '--concurrency=1',
];
export const bun = realExecutable('bun', '/nonexistent');
export const realNode = realExecutable('node', '/nonexistent');
export const fixturePath = [
  dirname(realNode),
  dirname(bun),
  '/usr/bin',
  '/bin',
].join(delimiter);
export const entry = resolve('src/cli/resources-entry.ts');
export const processTimeout = 15_000;
export const crossProcessTimeout = 45_000;
export interface FixtureProducer {
  alive: () => boolean | Promise<boolean>;
  diagnostics: () => string;
}
let deadline = Infinity;
beforeEach(({ task }) => {
  deadline = Date.now() + (task.timeout || 45_000) - 1000;
});

export function groupProducer(pid: number): FixtureProducer {
  return {
    alive: () => processGroupAlive(pid),
    diagnostics: () => `detached group ${pid}`,
  };
}
export function operationProducer(
  operation: Promise<unknown>,
  label: string
): FixtureProducer {
  let pending = true;
  void operation.then(
    () => {
      pending = false;
    },
    () => {
      pending = false;
    }
  );
  return { alive: () => pending, diagnostics: () => label };
}
function childProducer(
  child: ChildProcess,
  stderr: () => string
): FixtureProducer {
  return {
    alive: () => child.exitCode === null && child.signalCode === null,
    diagnostics: () =>
      `PID ${child.pid}, exit ${child.exitCode}, signal ${child.signalCode}: ${stderr().trim().slice(-4000)}`,
  };
}

export async function until(
  check: () => Promise<boolean>,
  producers: readonly FixtureProducer[] = []
) {
  let inactiveSince: number | undefined;
  const end = deadline;
  for (;;) {
    if (await check()) return;
    const now = Date.now();
    const active = (
      await Promise.all(producers.map((producer) => producer.alive()))
    ).some(Boolean);
    if (active) inactiveSince = undefined;
    else inactiveSince ??= now;
    const settled = inactiveSince !== undefined && now - inactiveSince >= 1000;
    if (settled || now >= end) {
      if (await check()) return;
      const reason = settled
        ? 'producer exited before the barrier was reached'
        : 'test deadline approaching';
      throw new Error(
        `Resource fixture barrier unreachable: ${reason}. ${producers.map((producer) => producer.diagnostics()).join('; ')}`
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

export function jsLiteral(value: unknown) {
  const serialized = JSON.stringify(value);
  if (serialized === undefined)
    throw new TypeError('JavaScript literals must be JSON-serializable.');
  return serialized.replace(
    /[<>&/\u2028\u2029]/gu,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`
  );
}
export const exists = (path: string) =>
  readFile(path).then(
    () => true,
    () => false
  );

export function privateFixtures(ignorePressure = false) {
  const dirs: string[] = [];
  const children: ChildProcess[] = [];
  const preparations = new Map<string, ChildProcess>();
  const completions: Promise<unknown>[] = [];
  async function temporary() {
    const path = await realpath(
      await mkdtemp(join(tmpdir(), 'ttr-resources-test-'))
    );
    dirs.push(path);
    return path;
  }
  async function home(lanes = 2) {
    const path = await temporary();
    await atomicJson(join(path, 'config.json'), {
      ...defaultResourceConfig(),
      roots: [path],
      validationLanes: lanes,
      vitestWorkers: 2,
      buildJobs: 2,
    });
    return path;
  }
  async function script(home: string, name: string, text: string) {
    const path = join(home, `${name}.cjs`);
    await writeFile(path, text);
    return path;
  }
  async function held(path: string, name: string, drain = false) {
    return script(
      path,
      name,
      `const fs=require('fs');const base=${jsLiteral(join(path, name))};fs.writeFileSync(base+'.ready','');${drain ? "process.on('SIGTERM',()=>fs.writeFileSync(base+'.signal',''));" : ''}const timer=setInterval(()=>{if(fs.existsSync(base+'.release')){clearInterval(timer);process.exit(0)}},10);`
    );
  }
  function launch(
    home: string,
    args: string[],
    cwd = home,
    target = entry,
    env: NodeJS.ProcessEnv = {},
    budget = { memory: 24 * 1024 ** 3, cpus: 10 }
  ) {
    const shimEntry = join(home, 'fixture-shim.ts');
    const setup = resolve('src/cli/resources-setup.ts');
    // Only disposable test loaders mock the host. No production env switch/API.
    const prefix = `import {mock} from 'bun:test';import * as os from 'node:os';import {appendFileSync} from 'node:fs';mock.module('node:os',()=>({...os,totalmem:()=>${budget.memory},availableParallelism:()=>${budget.cpus},loadavg:()=>[1,1,1]}));appendFileSync(${jsLiteral(join(home, 'fixture-host.jsonl'))},JSON.stringify({pid:process.pid,memory:os.totalmem(),cpus:os.availableParallelism(),shim:process.argv[1]===${jsLiteral(shimEntry)}})+'\\n');const actual=await import(${jsLiteral(setup)});const install=actual.installResourceShims;const prepare=actual.setupResources;const validate=actual.installedResourceShims;const stable=actual.stableResourceEntry;mock.module(${jsLiteral(setup)},()=>({...actual,stableResourceEntry:(value)=>value===${jsLiteral(entry)}?${jsLiteral(shimEntry)}:stable(value),installedResourceShims:(home)=>validate(home,${jsLiteral(shimEntry)}),installResourceShims:(home)=>install(home,${jsLiteral(shimEntry)}),setupResources:async(options)=>{const result=await prepare(options);if(!options.dryRun)await install(options.home,${jsLiteral(shimEntry)});return result;}}));`;
    const shimSource = `${prefix}await import(${jsLiteral(entry)});`;
    if (existsSync(shimEntry)) {
      if (readFileSync(shimEntry, 'utf8') !== shimSource)
        throw new Error(
          'Fixture shim host budget changed; use a fresh fixture home'
        );
    } else
      writeFileSync(shimEntry, shimSource, {
        mode: 0o600,
      });
    const previous = preparations.get(home);
    const ready = join(home, 'fixture-install.complete');
    const prepare = previous
      ? `const {existsSync,writeFileSync}=await import('node:fs');const {setTimeout}=await import('node:timers/promises');writeFileSync(${jsLiteral(join(home, 'fixture-preparation-waiter.'))}+process.pid,'');while(!existsSync(${jsLiteral(ready)})){try{const preparer=${previous.pid ?? 0};if(!preparer)throw new Error('No preparer PID');process.kill(preparer,0)}catch{throw new Error('Fixture shim preparer exited before publication')}await setTimeout(10)}`
      : `await install(${jsLiteral(home)},${jsLiteral(shimEntry)});const {writeFileSync}=await import('node:fs');writeFileSync(${jsLiteral(ready)},'ready');`;
    const loader = join(home, `fixture-launch-${children.length}.ts`);
    writeFileSync(
      loader,
      `${prefix}if(process.argv[2]==='run'){${prepare}}await import(${jsLiteral(target)});`,
      {
        mode: 0o600,
      }
    );
    const cliArgs =
      ignorePressure && args[0] === 'run'
        ? ['run', '--ignore-pressure', ...args.slice(1)]
        : args;
    const child = spawn(bun, [loader, ...cliArgs], {
      cwd,
      env: {
        ...process.env,
        PATH: fixturePath,
        ...env,
        TTR_RESOURCES_HOME: home,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    children.push(child);
    if (args[0] === 'run' && !previous) preparations.set(home, child);
    let out = '';
    let err = '';
    child.stdout.on('data', (chunk) => {
      out += chunk;
    });
    child.stderr.on('data', (chunk) => {
      err += chunk;
    });
    const producer = childProducer(child, () => err);
    const finished = (event: 'exit' | 'close') =>
      new Promise<{ code: number | null; out: string; err: string }>(
        (resolve, reject) => {
          child.once('error', reject);
          child.once(event, (code) => resolve({ code, out, err }));
        }
      );
    const exited = finished('exit');
    void exited.catch(() => {});
    const done = finished('close');
    completions.push(done);
    return {
      child,
      exited,
      done,
      producer,
      until: (check: () => Promise<boolean>) => until(check, [producer]),
    };
  }
  const laneLaunch = (
    home: string,
    args: string[],
    target = entry,
    env: NodeJS.ProcessEnv = {}
  ) => launch(home, args, home, target, env);
  async function waiting(
    home: string,
    count: number,
    jobs: readonly { producer: FixtureProducer }[]
  ) {
    const { resourceQueueStatus } = await import('./resources-queue.js');
    await until(
      async () => (await resourceQueueStatus(home, 2)).waiting.length === count,
      jobs.map((job) => job.producer)
    );
  }
  async function release(home: string, name: string) {
    await writeFile(join(home, `${name}.release`), '');
  }
  async function cleanup() {
    // Release only fixture-owned barriers and child groups, then their brokers.
    for (const path of dirs) {
      for (const name of await readdir(path)) {
        if (name.endsWith('.cjs'))
          await writeFile(join(path, `${name.slice(0, -4)}.release`), '');
        if (name === 'receipt')
          await writeFile(join(path, 'receipt.release'), '');
        if (name.endsWith('.ready'))
          await writeFile(join(path, name.replace('.ready', '.release')), '');
      }
    }
    preparations.clear();
    for (const child of children.splice(0)) {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGTERM');
        await new Promise((resolve) => child.once('exit', resolve));
      }
    }
    await Promise.allSettled(completions.splice(0));
    await Promise.all(
      dirs.splice(0).map((path) => rm(path, { recursive: true, force: true }))
    );
  }
  return {
    temporary,
    home,
    script,
    held,
    launch,
    laneLaunch,
    waiting,
    release,
    cleanup,
    children,
  };
}

// These probes are lightweight executables named for classified tools. They
// inspect actual argv/env and durable owner caps without running those tools.
export async function workerProbe(
  home: string,
  tool: 'vitest' | 'cargo',
  name = 'probe'
) {
  const path = join(home, tool);
  await writeFile(
    path,
    `#!${realNode}
const fs=require('node:fs');fs.writeFileSync(${jsLiteral(join(home, `${name}.json`))},JSON.stringify({args:process.argv.slice(2),vitest:process.env.VITEST_MAX_WORKERS,cargo:process.env.CARGO_BUILD_JOBS,turbo:process.env.TURBO_CONCURRENCY}));const timer=setInterval(()=>{if(fs.existsSync(${jsLiteral(join(home, `${name}.release`))})){clearInterval(timer)}},10);`
  );
  await chmod(path, 0o700);
  return path;
}
