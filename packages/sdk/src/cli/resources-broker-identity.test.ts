import * as childProcess from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  originalResourceGroupDrained,
  ResourceOwnershipUncertain,
  spawnResourceCommand,
} from './resources-broker';
import {
  encodeResourceFrame,
  type ReportFrame,
  ResourceFrameReader,
  reportFrameSchema,
  resourceGroupInventory,
  resourceSignals,
} from './resources-launcher';
import { encodeWorkloadEnvironment } from './resources-launcher-environment';
import * as processIdentity from './resources-process-identity';
import type {
  KernelProcessIdentity,
  ProcessRecord,
  ProcessSnapshot,
} from './resources-process-types';
import {
  bun,
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
const pid = 41000;
const record: ProcessRecord = {
  pid,
  parent: 1,
  group: pid,
  identity,
  zombie: false,
};
const snapshot = (
  processes: ProcessRecord[]
): Extract<ProcessSnapshot, { kind: 'ready' }> => ({
  kind: 'ready',
  processes,
  context: identity,
  unavailable: [],
  complete: true,
});
const tick = async () => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};
function barrier() {
  let release = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release: () => release() };
}
const listenerCounts = () =>
  resourceSignals.map((signal) => process.listenerCount(signal));

function deliverRelaySignal(signal: NodeJS.Signals) {
  const handler = process.listeners(signal).at(-1);
  if (!handler) throw new Error('Resource signal handler missing');
  handler.call(process);
}

describe('owned broker identity protocol', () => {
  const children: childProcess.ChildProcess[] = [];
  const releases: (() => void)[] = [];
  beforeEach(() => {
    // The broker observes itself to check the relay's identity context.
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
    for (const release of releases.splice(0)) release();
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
    const kill = vi.spyOn(child, 'kill').mockReturnValue(true);
    const nonce = () => {
      const bootstrap = spawn.mock.calls[0]?.[1]?.[1];
      if (typeof bootstrap !== 'string')
        throw new Error('Missing relay bootstrap');
      const match = bootstrap.match(/"([a-f0-9]{64})"\);$/u)?.[1];
      if (!match) throw new Error('Missing launch nonce');
      return match;
    };
    const report = (frame: ReportFrame) =>
      reports.write(encodeResourceFrame(frame));
    const hello = () =>
      report({ kind: 'hello', pid, identity, nonce: nonce() });
    const close = (
      code: number | null = 0,
      signal: NodeJS.Signals | null = null
    ) => child.emit('close', code, signal);
    return {
      child,
      control,
      reports,
      frames,
      nonce,
      report,
      hello,
      close,
      kill,
      spawn,
    };
  }
  it('persists the actual identity before granting launch and removes signal listeners', async () => {
    const before = listenerCounts();
    const relay = fakeRelay();
    const receipt = barrier();
    releases.push(receipt.release);
    const persist = vi.fn(() => receipt.promise);
    const completion = spawnResourceCommand('payload', [], {}, true, persist);
    relay.hello();
    await tick();
    expect(persist).toHaveBeenCalledExactlyOnceWith(pid, identity);
    expect(relay.frames).toEqual([]);
    receipt.release();
    await tick();
    expect(relay.frames).toEqual([{ kind: 'launch', nonce: relay.nonce() }]);
    relay.report({ kind: 'drained', nonce: relay.nonce(), code: 0 });
    relay.close();
    expect(await completion).toBe(0);
    expect(listenerCounts()).toEqual(before);
  });
  it('callback failure closes the pregrant pipe without numeric signaling or launch', async () => {
    const relay = fakeRelay();
    const signal = vi.spyOn(process, 'kill').mockImplementation(() => {
      throw new Error('numeric signal');
    });
    const completion = spawnResourceCommand(
      'payload',
      [],
      {},
      true,
      async () => {
        throw new Error('receipt failed');
      }
    ).catch((error: unknown) => error);
    relay.hello();
    await tick();
    expect(relay.control.writableEnded).toBe(true);
    expect(relay.frames).toEqual([]);
    relay.close(143);
    expect(await completion).toEqual(
      expect.objectContaining({ message: 'receipt failed' })
    );
    expect(signal).not.toHaveBeenCalled();
    expect(relay.kill).not.toHaveBeenCalled();
  });
  it('rejects a wrong nonce before invoking the durable callback', async () => {
    const relay = fakeRelay();
    const persist = vi.fn(async () => {});
    const completion = spawnResourceCommand(
      'payload',
      [],
      {},
      true,
      persist
    ).catch((error: unknown) => error);
    relay.report({ kind: 'hello', nonce: '0'.repeat(64), pid, identity });
    await tick();
    expect(relay.control.writableEnded).toBe(true);
    expect(persist).not.toHaveBeenCalled();
    expect(relay.frames).toEqual([]);
    relay.close(143);
    expect(await completion).toEqual(
      expect.objectContaining({ message: 'Resource relay nonce mismatch' })
    );
  });
  it('bounds the initial identity report by the existing 30s grace', async () => {
    vi.useFakeTimers();
    const relay = fakeRelay();
    const completion = spawnResourceCommand('payload', [], {}, true).catch(
      (error: unknown) => error
    );
    vi.advanceTimersByTime(30_000);
    expect(relay.control.writableEnded).toBe(true);
    expect(relay.frames).toEqual([]);
    relay.close(143);
    expect(await completion).toEqual(
      expect.objectContaining({
        message: expect.stringContaining('identity report missing after 30s'),
      })
    );
  });
  it.each(resourceSignals)(
    '%s during persistence uses only the private cancellation pipe',
    async (signal) => {
      const before = listenerCounts();
      const relay = fakeRelay();
      const receipt = barrier();
      releases.push(receipt.release);
      const numericSignal = vi.spyOn(process, 'kill').mockReturnValue(true);
      const completion = spawnResourceCommand(
        'payload',
        [],
        {},
        true,
        () => receipt.promise
      );
      relay.hello();
      await tick();
      deliverRelaySignal(signal);
      expect(relay.frames).toEqual([
        { kind: 'cancel', nonce: relay.nonce(), signal },
      ]);
      relay.close(null, signal);
      let finished = false;
      void completion.then(() => {
        finished = true;
      });
      await tick();
      expect(finished).toBe(false);
      receipt.release();
      expect(await completion).toBe(
        signal === 'SIGINT' ? 130 : signal === 'SIGHUP' ? 129 : 143
      );
      expect(numericSignal).not.toHaveBeenCalled();
      expect(relay.kill).not.toHaveBeenCalled();
      expect(listenerCounts()).toEqual(before);
    }
  );
  it.each(resourceSignals)(
    'a PID replaced after receipt lookup cannot receive %s',
    async (signal) => {
      const relay = fakeRelay();
      const observe = vi.mocked(processIdentity.observeProcess);
      observe.mockReturnValue({ kind: 'present', process: record });
      const numericSignal = vi.spyOn(process, 'kill').mockReturnValue(true);
      const completion = spawnResourceCommand(
        'payload',
        [],
        {},
        true,
        async (childPid) => {
          expect(processIdentity.observeProcess(childPid)).toEqual({
            kind: 'present',
            process: record,
          });
          observe.mockReturnValue({
            kind: 'present',
            process: { ...record, identity: { ...identity, birth: '101' } },
          });
        }
      );
      relay.hello();
      await tick();
      deliverRelaySignal(signal);
      expect(relay.frames).toEqual([
        { kind: 'launch', nonce: relay.nonce() },
        { kind: 'cancel', nonce: relay.nonce(), signal },
      ]);
      // Only the callback looked up the child PID; the broker never did.
      expect(observe.mock.calls.filter(([seen]) => seen === pid)).toHaveLength(
        1
      );
      expect(numericSignal).not.toHaveBeenCalled();
      expect(relay.kill).not.toHaveBeenCalled();
      relay.report({ kind: 'drained', nonce: relay.nonce(), code: 0 });
      relay.close();
      await completion;
    }
  );
  it('broken postgrant control retains ownership and removes listeners', async () => {
    const before = listenerCounts();
    const relay = fakeRelay();
    const completion = spawnResourceCommand('payload', [], {}, true).catch(
      (error: unknown) => error
    );
    relay.hello();
    await tick();
    relay.control.emit('error', new Error('EPIPE'));
    const error = await completion;
    expect(error).toBeInstanceOf(ResourceOwnershipUncertain);
    expect(error).toMatchObject({
      retainResourceOwnership: true,
      pid,
      identity,
    });
    expect(relay.kill).not.toHaveBeenCalled();
    expect(listenerCounts()).toEqual(before);
  });
  it('forced exit cannot release a surviving original group', async () => {
    const relay = fakeRelay();
    vi.mocked(processIdentity.snapshotProcesses).mockReturnValue(
      snapshot([{ ...record, pid: pid + 1 }])
    );
    const completion = spawnResourceCommand('payload', [], {}, true).catch(
      (error: unknown) => error
    );
    relay.hello();
    await tick();
    relay.close(null, 'SIGKILL');
    expect(await completion).toMatchObject({ retainResourceOwnership: true });
    expect(processIdentity.snapshotProcesses).toHaveBeenCalledTimes(1);
  });
  it('forced exit releases only when the original group is authoritatively empty', async () => {
    const relay = fakeRelay();
    const completion = spawnResourceCommand('payload', [], {}, true);
    relay.hello();
    await tick();
    relay.close(null, 'SIGKILL');
    expect(await completion).toBe(143);
    expect(processIdentity.snapshotProcesses).toHaveBeenCalledTimes(1);
  });
  it('unowned spawn preserves direct child signaling and signal exit codes', async () => {
    const before = listenerCounts();
    const relay = fakeRelay();
    const completion = spawnResourceCommand('payload', ['arg'], {
      TEST: 'value',
    });
    deliverRelaySignal('SIGINT');
    expect(relay.spawn).toHaveBeenCalledWith('payload', ['arg'], {
      env: { TEST: 'value' },
      shell: false,
      stdio: 'inherit',
    });
    expect(relay.kill).toHaveBeenCalledExactlyOnceWith('SIGINT');
    relay.child.emit('exit', null, 'SIGINT');
    expect(await completion).toBe(130);
    await tick();
    expect(listenerCounts()).toEqual(before);
  });
});

describe('authoritative group inventory and bounded frames', () => {
  afterEach(() => vi.restoreAllMocks());
  it('excludes its own anchor and zombies while retaining original descendants', () => {
    expect(
      resourceGroupInventory(snapshot([record]), pid, identity, true)
    ).toBe('empty');
    const descendant = { ...record, pid: pid + 1, parent: 1 };
    expect(
      resourceGroupInventory(
        snapshot([record, descendant]),
        pid,
        identity,
        true
      )
    ).toBe('busy');
    expect(
      resourceGroupInventory(
        snapshot([record, { ...descendant, zombie: true }]),
        pid,
        identity,
        true
      )
    ).toBe('empty');
    expect(
      resourceGroupInventory(snapshot([descendant]), pid, identity, true)
    ).toBe('unknown');
  });
  it('unknown identities in a known unrelated group do not hide an empty original group', () => {
    expect(
      resourceGroupInventory(
        {
          ...snapshot([record]),
          complete: false,
          unavailable: [{ pid: pid + 100, group: 0 }],
        },
        pid,
        identity,
        true
      )
    ).toBe('empty');
    expect(
      resourceGroupInventory(
        {
          ...snapshot([record]),
          complete: false,
          unavailable: [{ pid: pid + 100, group: pid }],
        },
        pid,
        identity,
        true
      )
    ).toBe('unknown');
  });
  it('incomplete or inaccessible inspection cannot certify drain', () => {
    expect(
      resourceGroupInventory(
        { ...snapshot([]), complete: false },
        pid,
        identity,
        false
      )
    ).toBe('unknown');
    expect(
      resourceGroupInventory(
        { kind: 'unavailable', reason: 'EPERM' },
        pid,
        identity,
        false
      )
    ).toBe('unknown');
    vi.spyOn(processIdentity, 'observeProcess').mockReturnValue({
      kind: 'unavailable',
      reason: 'EPERM',
    });
    expect(originalResourceGroupDrained(pid, identity)).toBe(false);
  });
  it('a different host or namespace cannot prove original absence', () => {
    const observe = vi.spyOn(processIdentity, 'observeProcess');
    for (const different of [
      { host: 'other' },
      { namespace: 'other' },
      { backend: 'darwin-libproc-v1' } satisfies Partial<KernelProcessIdentity>,
    ]) {
      observe.mockReturnValue({
        kind: 'present',
        process: { ...record, identity: { ...identity, ...different } },
      });
      expect(originalResourceGroupDrained(pid, identity)).toBe(false);
    }
    observe.mockReturnValue({
      kind: 'present',
      process: { ...record, identity: { ...identity, boot: 'new-boot' } },
    });
    expect(originalResourceGroupDrained(pid, identity)).toBe(true);
  });
  it('validates partial frames and rejects truncation, oversize and excessive frames', () => {
    const frames: unknown[] = [];
    const reader = new ResourceFrameReader((value) => frames.push(value));
    reader.push(Buffer.from('{"kind":'));
    reader.push(Buffer.from('"launch"}\n'));
    expect(frames).toEqual([{ kind: 'launch' }]);
    reader.push(Buffer.from('x'));
    expect(() => reader.end()).toThrow('Truncated');
    expect(() =>
      new ResourceFrameReader(() => {}).push(Buffer.alloc(4097))
    ).toThrow('limit');
    expect(() =>
      new ResourceFrameReader(() => {}).push(Buffer.from('{}\n'.repeat(17)))
    ).toThrow('limit');
  });
});

describe('real detached relay lifecycle', () => {
  const fixtures = privateFixtures();
  const completions: Promise<unknown>[] = [];
  afterEach(async () => {
    await fixtures.cleanup();
    await Promise.allSettled(completions.splice(0));
  });
  async function relayFor(path: string, payload: string, prefix = '') {
    const nonce = 'a'.repeat(64);
    const modulePath = resolve('src/cli/resources-launcher.ts');
    const child = childProcess.spawn(
      bun,
      [
        '-e',
        `${prefix}require(${jsLiteral(modulePath)}).runResourceLauncher(${jsLiteral(realNode)},[${jsLiteral(payload)}],${jsLiteral(nonce)});`,
      ],
      {
        detached: true,
        env: { ...process.env, PATH: fixturePath },
        stdio: ['ignore', 'pipe', 'pipe', 'pipe', 'pipe', 'pipe'],
      }
    );
    fixtures.children.push(child);
    const control = child.stdio[3];
    const reports = child.stdio[4];
    const environment = child.stdio.at(5);
    if (!(environment instanceof Writable))
      throw new Error('Missing environment pipe');
    environment.end(
      encodeWorkloadEnvironment(nonce, { ...process.env, PATH: fixturePath })
    );
    if (!(control instanceof Writable) || !reports)
      throw new Error('Missing relay pipes');
    child.stdout?.resume();
    let stderr = '';
    child.stderr?.on('data', (chunk) => {
      stderr = `${stderr}${chunk}`.slice(-8000);
    });
    const frames: ReportFrame[] = [];
    const reader = new ResourceFrameReader((value) =>
      frames.push(reportFrameSchema.parse(value))
    );
    reports.on('data', (chunk) => reader.push(chunk));
    control.on('error', () => {});
    const done = new Promise<number | null>((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code) => resolve(code));
    });
    void done.catch(() => {});
    completions.push(done);
    const producer = {
      alive: () => child.exitCode === null && child.signalCode === null,
      diagnostics: () => `relay ${child.pid} in ${path}: ${stderr}`,
    };
    await until(
      async () => frames.some((frame) => frame.kind === 'hello'),
      [producer]
    );
    const grant = () =>
      control.write(encodeResourceFrame({ kind: 'launch', nonce }));
    return {
      child,
      control,
      frames,
      nonce,
      grant,
      done,
      producer,
      stderr: () => stderr,
    };
  }
  it.each(['eof', 'unframed bytes', 'wrong nonce'])(
    'never launches on pregrant %s',
    async (mode) => {
      const path = await fixtures.temporary();
      const payload = await fixtures.held(path, 'payload');
      const relay = await relayFor(path, payload);
      if (mode === 'wrong nonce')
        relay.control.end(
          encodeResourceFrame({ kind: 'launch', nonce: 'b'.repeat(64) })
        );
      else relay.control.end(mode === 'unframed bytes' ? 'launch' : undefined);
      expect(await relay.done).toBe(143);
      expect(await exists(join(path, 'payload.ready'))).toBe(false);
    },
    processTimeout
  );
  it(
    'retains the detached original group through payload exit and broker EOF until descendants drain',
    async () => {
      const path = await fixtures.temporary();
      const descendant = await fixtures.held(path, 'descendant');
      const payload = await fixtures.script(
        path,
        'payload',
        `const cp=require('node:child_process');const fs=require('node:fs');cp.spawn(${jsLiteral(realNode)},[${jsLiteral(descendant)}],{stdio:'inherit'}).unref();fs.writeFileSync(${jsLiteral(join(path, 'payload.ready'))},String(process.pid));`
      );
      const relay = await relayFor(path, payload);
      relay.grant();
      await until(
        async () =>
          (await exists(join(path, 'descendant.ready'))) &&
          (await exists(join(path, 'payload.ready'))),
        [relay.producer]
      );
      const payloadPid = Number(
        await readFile(join(path, 'payload.ready'), 'utf8')
      );
      await until(
        async () => processIdentity.observeProcess(payloadPid).kind === 'gone',
        [relay.producer]
      );
      relay.control.end();
      expect(relay.child.exitCode).toBeNull();
      expect(relay.frames.some((frame) => frame.kind === 'drained')).toBe(
        false
      );
      await fixtures.release(path, 'descendant');
      expect(await relay.done).toBe(0);
      expect(relay.frames).toContainEqual({
        kind: 'drained',
        nonce: relay.nonce,
        code: 0,
      });
    },
    processTimeout
  );
  it(
    'unknown inspection preserves the anchor until authoritative inspection returns',
    async () => {
      const path = await fixtures.temporary();
      const payload = await fixtures.script(path, 'payload', '');
      const identityModule = resolve('src/cli/resources-process-identity.ts');
      const release = join(path, 'inspection.release');
      const prefix = `const {mock}=require('bun:test');const fs=require('node:fs');const backend=require(${jsLiteral(identityModule)});const snapshot=backend.snapshotProcesses;fs.writeFileSync(${jsLiteral(join(path, 'inspection.ready'))},'');mock.module(${jsLiteral(identityModule)},()=>({...backend,snapshotProcesses:()=>fs.existsSync(${jsLiteral(release)})?snapshot():({kind:'unavailable',reason:'injected EPERM'})}));`;
      const relay = await relayFor(path, payload, prefix);
      relay.grant();
      await until(
        async () => relay.stderr().includes('cannot verify group drain'),
        [relay.producer]
      );
      expect(relay.child.exitCode).toBeNull();
      expect(relay.frames.some((frame) => frame.kind === 'drained')).toBe(
        false
      );
      await fixtures.release(path, 'inspection');
      expect(await relay.done).toBe(0);
      expect(relay.frames).toContainEqual({
        kind: 'drained',
        nonce: relay.nonce,
        code: 0,
      });
    },
    processTimeout
  );
  it(
    'backs off busy drain inspection while a descendant holds the group',
    async () => {
      const path = await fixtures.temporary();
      const descendant = await fixtures.held(path, 'descendant');
      const payload = await fixtures.script(
        path,
        'payload',
        `require('node:child_process').spawn(${jsLiteral(realNode)},[${jsLiteral(descendant)}],{stdio:'inherit'}).unref();`
      );
      const identityModule = resolve('src/cli/resources-process-identity.ts');
      const counter = join(path, 'snapshots.log');
      const prefix = `const {mock}=require('bun:test');const fs=require('node:fs');const backend=require(${jsLiteral(identityModule)});const snapshot=backend.snapshotProcesses;mock.module(${jsLiteral(identityModule)},()=>({...backend,snapshotProcesses:()=>{fs.appendFileSync(${jsLiteral(counter)},'.');return snapshot()}}));`;
      const snapshots = () =>
        readFile(counter, 'utf8').then(
          (text) => text.length,
          () => 0
        );
      const relay = await relayFor(path, payload, prefix);
      relay.grant();
      await until(async () => (await snapshots()) > 0, [relay.producer]);
      const before = await snapshots();
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const during = (await snapshots()) - before;
      await fixtures.release(path, 'descendant');
      expect(await relay.done).toBe(0);
      // A 25 ms tick would take about 40 snapshots in this window.
      expect(during).toBeLessThanOrEqual(8);
    },
    processTimeout
  );
  it.each(resourceSignals)(
    'relays %s within its own pinned group without self-signal recursion',
    async (signal) => {
      const path = await fixtures.temporary();
      const payload = await fixtures.held(path, 'payload');
      const relay = await relayFor(path, payload);
      relay.grant();
      await until(() => exists(join(path, 'payload.ready')), [relay.producer]);
      relay.control.write(
        encodeResourceFrame({ kind: 'cancel', nonce: relay.nonce, signal })
      );
      const code = signal === 'SIGINT' ? 130 : signal === 'SIGHUP' ? 129 : 143;
      expect(await relay.done).toBe(code);
      expect(relay.frames).toContainEqual({
        kind: 'drained',
        nonce: relay.nonce,
        code,
      });
    },
    processTimeout
  );
});
