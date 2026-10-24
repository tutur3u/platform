import * as childProcess from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ResourceOwnershipUncertain,
  resourceExitReceiptGraceMs,
  spawnResourceCommand,
} from './resources-broker';
import {
  encodeResourceFrame,
  type ReportFrame,
  ResourceFrameReader,
  resourceSignals,
} from './resources-launcher';
import * as processIdentity from './resources-process-identity';
import type {
  KernelProcessIdentity,
  ProcessRecord,
} from './resources-process-types';
import {
  exists,
  fixturePath,
  jsLiteral,
  privateFixtures,
  processTimeout,
  realNode,
  until,
} from './resources-test-fixtures';

vi.mock('node:child_process', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
}));

const identity: KernelProcessIdentity = {
  backend: 'linux-proc-v1',
  host: 'host',
  boot: 'boot',
  namespace: 'namespace',
  birth: '100',
};
const pid = 42000;
const record: ProcessRecord = {
  pid,
  parent: 1,
  group: pid,
  identity,
  zombie: false,
};
const snapshot = (processes: ProcessRecord[]) => ({
  kind: 'ready' as const,
  processes,
  context: identity,
  unavailable: [],
  complete: true,
});
const tick = async () => {
  for (let index = 0; index < 5; index++) await Promise.resolve();
};

function deliverRelaySignal(signal: NodeJS.Signals) {
  const handler = process.listeners(signal).at(-1);
  if (!handler) throw new Error('Resource signal handler missing');
  handler.call(process);
}

describe('owned broker settlement and relay identity context', () => {
  const children: childProcess.ChildProcess[] = [];
  beforeEach(() => {
    vi.spyOn(processIdentity, 'observeProcess').mockImplementation(
      (observed) =>
        observed === process.pid
          ? { kind: 'present', process: { ...record, pid: observed } }
          : { kind: 'gone' }
    );
    vi.spyOn(processIdentity, 'snapshotProcesses').mockReturnValue(
      snapshot([])
    );
  });
  afterEach(async () => {
    for (const child of children.splice(0)) {
      child.emit('exit', 143, null);
      child.emit('close', 143, null);
    }
    await tick();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });
  function fakeRelay() {
    const child = new childProcess.ChildProcess();
    const control = new PassThrough();
    const reports = new PassThrough();
    const frames: unknown[] = [];
    const reader = new ResourceFrameReader((frame) => frames.push(frame));
    control.on('data', (chunk) => reader.push(chunk));
    Object.defineProperties(child, {
      pid: { value: pid },
      stdio: { value: [null, null, null, control, reports, new PassThrough()] },
    });
    children.push(child);
    const spawn = vi.spyOn(childProcess, 'spawn').mockReturnValue(child);
    const nonce = () => {
      const bootstrap = spawn.mock.calls[0]?.[1]?.[1];
      const match =
        typeof bootstrap === 'string'
          ? bootstrap.match(/"([a-f0-9]{64})"\);$/u)?.[1]
          : undefined;
      if (!match) throw new Error('Missing launch nonce');
      return match;
    };
    const report = (frame: ReportFrame) =>
      reports.write(encodeResourceFrame(frame));
    const granted = async (
      hello: KernelProcessIdentity = identity,
      persist = vi.fn(async () => {})
    ) => {
      const completion = spawnResourceCommand(
        'payload',
        [],
        {},
        true,
        persist
      ).catch((error: unknown) => error);
      report({ kind: 'hello', pid, identity: hello, nonce: nonce() });
      await tick();
      return { completion };
    };
    return { child, control, reports, frames, nonce, report, granted, spawn };
  }

  it('settles on relay exit plus drain receipt while an escaped holder keeps reports open', async () => {
    const relay = fakeRelay();
    const { completion } = await relay.granted();
    expect(relay.frames).toEqual([{ kind: 'launch', nonce: relay.nonce() }]);
    relay.report({ kind: 'drained', nonce: relay.nonce(), code: 7 });
    relay.child.emit('exit', 0, null);
    expect(await completion).toBe(7);
    expect(processIdentity.snapshotProcesses).not.toHaveBeenCalled();
  });
  it('accepts a drain receipt read just after the exit event', async () => {
    const relay = fakeRelay();
    const { completion } = await relay.granted();
    relay.child.emit('exit', 0, null);
    await tick();
    relay.report({ kind: 'drained', nonce: relay.nonce(), code: 7 });
    expect(await completion).toBe(7);
  });
  it.each([
    ['releases', [] as ProcessRecord[]],
    ['retains', [{ ...record, pid: pid + 1 }]],
  ])(
    'without a receipt, exit waits a bounded grace and %s by verified group inspection',
    async (outcome, survivors) => {
      vi.mocked(processIdentity.snapshotProcesses).mockReturnValue(
        snapshot(survivors)
      );
      const relay = fakeRelay();
      const { completion } = await relay.granted();
      let finished = false;
      void completion.then(() => {
        finished = true;
      });
      relay.child.emit('exit', null, 'SIGKILL');
      const started = performance.now();
      await tick();
      expect(finished).toBe(false);
      const result = await completion;
      expect(performance.now() - started).toBeGreaterThanOrEqual(
        resourceExitReceiptGraceMs - 5
      );
      if (outcome === 'releases') expect(result).toBe(143);
      else {
        expect(result).toBeInstanceOf(ResourceOwnershipUncertain);
        expect(result).toMatchObject({ pid, identity });
      }
    }
  );
  it('a report EOF after grant waits for exit instead of rejecting a live relay', async () => {
    const relay = fakeRelay();
    const { completion } = await relay.granted();
    let finished = false;
    void completion.then(() => {
      finished = true;
    });
    relay.reports.end();
    relay.control.destroy();
    await tick();
    expect(finished).toBe(false);
    relay.child.emit('exit', 0, null);
    relay.child.emit('close', 0, null);
    expect(await completion).toBe(0);
    expect(processIdentity.snapshotProcesses).toHaveBeenCalledTimes(1);
  });
  it.each(['backend', 'host', 'boot', 'namespace'] as const)(
    'rejects a relay whose %s differs from the broker before persisting it',
    async (field) => {
      const relay = fakeRelay();
      const persist = vi.fn(async () => {});
      const different =
        field === 'backend'
          ? { ...identity, backend: 'darwin-libproc-v1' as const }
          : { ...identity, [field]: 'other' };
      const { completion } = await relay.granted(different, persist);
      expect(persist).not.toHaveBeenCalled();
      expect(relay.control.writableEnded).toBe(true);
      expect(relay.frames).toEqual([]);
      relay.child.emit('exit', 143, null);
      relay.child.emit('close', 143, null);
      expect(await completion).toEqual(
        expect.objectContaining({
          message: expect.stringContaining('context differs from the broker'),
        })
      );
    }
  );
  it('starts no relay when the broker identity is unavailable', async () => {
    const relay = fakeRelay();
    vi.mocked(processIdentity.observeProcess).mockReturnValue({
      kind: 'unavailable',
      reason: 'EPERM.',
    });
    await expect(
      spawnResourceCommand('payload', [], {}, true, async () => {})
    ).rejects.toThrow('No owned workload was started');
    expect(relay.spawn).not.toHaveBeenCalled();
  });
  it('refuses a spawn receipt for unowned commands instead of a PID relookup', async () => {
    const relay = fakeRelay();
    await expect(
      spawnResourceCommand('payload', [], {}, false, async () => {})
    ).rejects.toThrow('require an owned resource relay');
    expect(relay.spawn).not.toHaveBeenCalled();
    expect(processIdentity.observeProcess).not.toHaveBeenCalled();
  });
  it('bounds a cancel burst and forwards a later repeated Ctrl-C', async () => {
    vi.useFakeTimers();
    const relay = fakeRelay();
    const { completion } = await relay.granted();
    for (let round = 0; round < 20; round++)
      for (const signal of resourceSignals) deliverRelaySignal(signal);
    expect(relay.frames).toEqual([
      { kind: 'launch', nonce: relay.nonce() },
      ...resourceSignals.map((signal) => ({
        kind: 'cancel',
        nonce: relay.nonce(),
        signal,
      })),
    ]);
    vi.advanceTimersByTime(250);
    deliverRelaySignal('SIGINT');
    expect(relay.frames).toHaveLength(5);
    expect(relay.frames.at(-1)).toEqual({
      kind: 'cancel',
      nonce: relay.nonce(),
      signal: 'SIGINT',
    });
    relay.report({ kind: 'drained', nonce: relay.nonce(), code: 130 });
    relay.child.emit('exit', 130, null);
    expect(await completion).toBe(130);
  });
});

describe('real relay workload descriptors', () => {
  const fixtures = privateFixtures();
  const escaped: string[] = [];
  afterEach(async () => {
    for (const path of escaped.splice(0)) {
      await fixtures.release(path, 'daemon');
      const text = await readFile(join(path, 'daemon.pid'), 'utf8').catch(
        (error: unknown) => {
          if (
            error instanceof Error &&
            'code' in error &&
            error.code === 'ENOENT'
          )
            return undefined;
          throw error;
        }
      );
      if (text === undefined) continue;
      const pid = Number(text);
      await until(async () => {
        const observed = processIdentity.observeProcess(pid);
        return (
          observed.kind === 'gone' ||
          (observed.kind === 'present' && observed.process.zombie)
        );
      }, [
        {
          alive: () => processIdentity.observeProcess(pid).kind !== 'gone',
          diagnostics: () =>
            `escaped fixture daemon ${pid} must drain before deleting ${path}`,
        },
      ]);
    }
    await fixtures.cleanup();
  });
  const env = () => ({ ...process.env, PATH: fixturePath });

  it(
    'an escaped daemon holding inherited descriptors cannot hold broker completion',
    async () => {
      const path = await fixtures.temporary();
      escaped.push(path);
      const daemon = await fixtures.script(
        path,
        'daemon',
        `const fs=require('node:fs');const base=${jsLiteral(join(path, 'daemon'))};fs.writeFileSync(base+'.pid',String(process.pid));fs.writeFileSync(base+'.ready','');const timer=setInterval(()=>{if(fs.existsSync(base+'.release'))process.exit(0)},10);setTimeout(()=>process.exit(0),${processTimeout}).unref();`
      );
      const payload = await fixtures.script(
        path,
        'payload',
        `const cp=require('node:child_process');const fs=require('node:fs');cp.spawn(${jsLiteral(realNode)},[${jsLiteral(daemon)}],{detached:true,stdio:'inherit'}).unref();const wait=setInterval(()=>{if(fs.existsSync(${jsLiteral(join(path, 'daemon.ready'))}))clearInterval(wait)},10);`
      );
      expect(await spawnResourceCommand(realNode, [payload], env(), true)).toBe(
        0
      );
      expect(await exists(join(path, 'daemon.ready'))).toBe(true);
      expect(await exists(join(path, 'daemon.release'))).toBe(false);
      const daemonPid = Number(
        await readFile(join(path, 'daemon.pid'), 'utf8')
      );
      expect(processIdentity.observeProcess(daemonPid).kind).toBe('present');
    },
    processTimeout
  );
  it(
    'a workload that knows the nonce cannot forge relay reports',
    async () => {
      const path = await fixtures.temporary();
      const result = join(path, 'forgery.json');
      // The nonce is visible in the relay argv; the channels must stay private.
      const payload = await fixtures.script(
        path,
        'payload',
        `const fs=require('node:fs');const cp=require('node:child_process');let argv='';try{argv=fs.readFileSync('/proc/'+process.ppid+'/cmdline','utf8')}catch{argv=cp.execFileSync('ps',['-o','command=','-p',String(process.ppid)],{encoding:'utf8'})}const nonce=(argv.match(/[a-f0-9]{64}/)||[])[0];const frame=JSON.stringify({kind:'drained',nonce,code:77})+'\\n';const writes={};for(const fd of [3,4,5]){try{fs.writeSync(fd,frame);writes[fd]='written'}catch(error){writes[fd]=error.code}}fs.writeFileSync(${jsLiteral(result)},JSON.stringify({nonce:Boolean(nonce),writes}));`
      );
      expect(await spawnResourceCommand(realNode, [payload], env(), true)).toBe(
        0
      );
      expect(JSON.parse(await readFile(result, 'utf8'))).toMatchObject({
        nonce: true,
      });
    },
    processTimeout
  );
});
