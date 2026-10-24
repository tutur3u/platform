import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { realExecutable } from './resources-command';
import {
  type ControlFrame,
  encodeResourceFrame,
  ResourceFrameReader,
  reportFrameSchema,
  resourceExitCode,
  resourceGroupInventory,
  resourceSignals,
  sameProcessContext,
} from './resources-launcher';
import {
  encodeWorkloadEnvironment,
  relayEnvironment,
} from './resources-launcher-environment';
import {
  observeProcess,
  snapshotProcesses,
} from './resources-process-identity';
import {
  identityEqual,
  type KernelProcessIdentity,
} from './resources-process-types';

export class ResourceOwnershipUncertain extends Error {
  readonly retainResourceOwnership = true;
  constructor(
    readonly pid: number,
    readonly identity: KernelProcessIdentity,
    reason: string
  ) {
    super(
      `Resource ownership for relay ${pid} is uncertain: ${reason}. Keep its slot and reservation; verify the original group has drained before recovery.`
    );
    this.name = 'ResourceOwnershipUncertain';
  }
}

export function originalResourceGroupDrained(
  pid: number,
  identity: KernelProcessIdentity
) {
  const observed = observeProcess(pid);
  if (observed.kind === 'unavailable') return false;
  if (observed.kind === 'present') {
    const current = observed.process.identity;
    if (
      current.backend !== identity.backend ||
      current.host !== identity.host ||
      current.namespace !== identity.namespace
    )
      return false;
    if (current.boot !== identity.boot) return true;
    if (!identityEqual(current, identity)) return true;
    if (!observed.process.zombie) return false;
  }
  return (
    resourceGroupInventory(snapshotProcesses(), pid, identity, false) ===
    'empty'
  );
}

type SpawnReceipt = (
  pid: number,
  identity: KernelProcessIdentity
) => Promise<void>;

// Bounds the wait for an already-written drain receipt after relay exit.
export const resourceExitReceiptGraceMs = 1000;

function spawnUnowned(command: string, args: string[], env: NodeJS.ProcessEnv) {
  return new Promise<number>((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      shell: false,
      stdio: 'inherit',
    });
    const handlers = resourceSignals.map((signal) => {
      const handler = () => {
        child.kill(signal);
      };
      process.on(signal, handler);
      return handler;
    });
    const clean = () =>
      resourceSignals.forEach((signal, index) => {
        const handler = handlers[index];
        if (handler) process.removeListener(signal, handler);
      });
    child.once('error', (error) => {
      clean();
      reject(error);
    });
    child.once('exit', (code, signal) => {
      clean();
      resolve(resourceExitCode(code, signal));
    });
  });
}

export async function spawnResourceCommand(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  owned = false,
  onSpawn?: SpawnReceipt
) {
  if (!owned) {
    // A PID looked up after spawn may already name a replacement process.
    if (onSpawn)
      throw new Error(
        'Spawn receipts require an owned resource relay; no command was started.'
      );
    return spawnUnowned(command, args, env);
  }
  const broker = observeProcess(process.pid);
  if (broker.kind !== 'present')
    throw new Error(
      `Cannot establish process ownership: ${broker.kind === 'unavailable' ? broker.reason : 'the broker identity is missing.'} No owned workload was started.`
    );
  const brokerContext = broker.process.identity;
  return new Promise<number>((resolve, reject) => {
    const nonce = randomBytes(32).toString('hex');
    const environmentBytes = encodeWorkloadEnvironment(nonce, env);
    const source = join(__dirname, 'resources-launcher.ts');
    const fromSource = existsSync(source);
    const modulePath = fromSource
      ? source
      : join(__dirname, 'resources-launcher.js');
    // Source execution needs Bun's TypeScript loader; the published entry is JS.
    const runtime =
      fromSource && !process.versions.bun
        ? realExecutable('bun', '/nonexistent', process.env.PATH)
        : process.execPath;
    const bootstrap = `require(${JSON.stringify(modulePath)}).runResourceLauncher(${JSON.stringify(command)},${JSON.stringify(args)},${JSON.stringify(nonce)});`;
    const child = spawn(runtime, ['-e', bootstrap], {
      env: relayEnvironment(env),
      shell: false,
      detached: true,
      stdio: ['inherit', 'inherit', 'inherit', 'pipe', 'pipe', 'pipe'],
    });
    const control = child.stdio[3];
    const reports = child.stdio[4];
    const environment = child.stdio.at(5);
    let identity: KernelProcessIdentity | undefined;
    let granted = false;
    let drainedCode: number | undefined;
    let exited:
      | { code: number | null; signal: NodeJS.Signals | null }
      | undefined;
    let reportsEnded = false;
    let graceElapsed = false;
    let exitGrace: NodeJS.Timeout | undefined;
    let settling = false;
    let settled = false;
    let failure: { error: unknown } | undefined;
    let receipt: Promise<void> = Promise.resolve();
    const sentSignals = new Map<NodeJS.Signals, number>();
    const closeGate = () => {
      if (control instanceof Writable) control.end();
    };
    const clean = () => {
      clearTimeout(initialization);
      clearTimeout(exitGrace);
      resourceSignals.forEach((signal, index) => {
        const handler = handlers[index];
        if (handler) process.removeListener(signal, handler);
      });
      control?.destroy();
      reports?.destroy();
      environment?.destroy();
    };
    const uncertain = (reason: string) => {
      if (settled || !child.pid || !identity) return;
      settled = true;
      clean();
      child.unref();
      reject(new ResourceOwnershipUncertain(child.pid, identity, reason));
    };
    const fail = (error: unknown) => {
      if (settled || drainedCode !== undefined) return;
      failure ??= { error };
      if (granted)
        uncertain(
          error instanceof Error ? error.message : 'control channel failed'
        );
      else closeGate();
    };
    const send = (frame: ControlFrame) => {
      if (
        !(control instanceof Writable) ||
        control.destroyed ||
        control.writableEnded
      )
        throw new Error('Resource relay control channel closed');
      control.write(encodeResourceFrame(frame));
    };
    // Bound bursts while preserving a later Ctrl-C for tools that escalate it.
    const handlers = resourceSignals.map((signal) => {
      const handler = () => {
        const now = Date.now();
        const previous = sentSignals.get(signal);
        if (settled || (previous !== undefined && now - previous < 250)) return;
        sentSignals.set(signal, now);
        try {
          send({ kind: 'cancel', nonce, signal });
        } catch (error) {
          fail(error);
        }
      };
      process.on(signal, handler);
      return handler;
    });
    const initialization = setTimeout(() => {
      fail(
        new Error(
          'Resource relay identity report missing after 30s; check the process identity backend.'
        )
      );
    }, 30_000);
    // Settle on relay exit, not stdio close: an escaped descendant may hold a
    // pipe open. A missing receipt falls back to verified group inspection.
    const settle = () => {
      if (!exited || settling || settled) return;
      if (drainedCode === undefined && !reportsEnded && !graceElapsed) return;
      settling = true;
      const { code, signal } = exited;
      void (async () => {
        await receipt;
        if (settled) return;
        if (
          granted &&
          drainedCode === undefined &&
          child.pid &&
          identity &&
          !originalResourceGroupDrained(child.pid, identity)
        ) {
          uncertain('relay exited without verified group drain');
          return;
        }
        settled = true;
        clean();
        if (failure) reject(failure.error);
        else resolve(drainedCode ?? resourceExitCode(code, signal));
      })().catch((error: unknown) => {
        if (granted)
          uncertain(
            error instanceof Error ? error.message : 'group inspection failed'
          );
        else {
          settled = true;
          clean();
          reject(error);
        }
      });
    };
    const reader = new ResourceFrameReader((value) => {
      const frame = reportFrameSchema.parse(value);
      if (frame.nonce !== nonce)
        throw new Error('Resource relay nonce mismatch');
      if (frame.kind === 'drained') {
        if (!granted || drainedCode !== undefined)
          throw new Error('Unexpected resource drain receipt');
        drainedCode = frame.code;
        settle();
        return;
      }
      if (identity || frame.pid !== child.pid)
        throw new Error('Invalid resource relay identity receipt');
      if (!sameProcessContext(frame.identity, brokerContext))
        throw new Error(
          'Resource relay identity context differs from the broker; no workload was launched.'
        );
      identity = frame.identity;
      clearTimeout(initialization);
      receipt = Promise.resolve()
        .then(async () => {
          if (failure || sentSignals.size || exited) return;
          await onSpawn?.(frame.pid, frame.identity);
          if (failure || sentSignals.size || settled || exited) return;
          // A write can succeed even if its acknowledgement is lost.
          if (!(environment instanceof Writable))
            throw new Error('Resource environment channel unavailable');
          environment.end(environmentBytes);
          granted = true;
          send({ kind: 'launch', nonce });
        })
        .catch(fail);
    });
    const reportsClosed = () => {
      reportsEnded = true;
      settle();
    };
    environment?.on('error', fail);
    control?.on('error', fail);
    reports?.on('error', fail);
    reports?.once('close', reportsClosed);
    if (reports instanceof Readable) {
      reports.on('data', (chunk) => {
        try {
          if (!Buffer.isBuffer(chunk))
            throw new Error('Invalid resource relay bytes');
          reader.push(chunk);
        } catch (error) {
          fail(error);
        }
      });
      reports.once('end', () => {
        try {
          reader.end();
        } catch (error) {
          fail(error);
        }
        reportsClosed();
      });
    } else fail(new Error('Resource relay report channel unavailable'));
    child.once('error', fail);
    child.once('exit', (code, signal) => {
      exited ??= { code, signal };
      if (settled) return;
      exitGrace = setTimeout(() => {
        graceElapsed = true;
        settle();
      }, resourceExitReceiptGraceMs);
      settle();
    });
    child.once('close', (code, signal) => {
      exited ??= { code, signal };
      reportsClosed();
    });
  });
}
