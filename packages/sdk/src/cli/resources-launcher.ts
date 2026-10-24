import { spawn } from 'node:child_process';
import { createReadStream, writeSync } from 'node:fs';
import { constants, setPriority } from 'node:os';
import { z } from 'zod';
import {
  decodeWorkloadEnvironment,
  resourceEnvironmentLimit,
} from './resources-launcher-environment';
import {
  observeProcess,
  snapshotProcesses,
} from './resources-process-identity';
import {
  identityEqual,
  type KernelProcessIdentity,
  type ProcessSnapshot,
  processIdentitySchema,
} from './resources-process-types';

export const resourceSignals = ['SIGINT', 'SIGTERM', 'SIGHUP'] as const;
const signalSchema = z.enum(resourceSignals);
const nonceSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const controlFrameSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('launch'), nonce: nonceSchema }).strict(),
  z
    .object({
      kind: z.literal('cancel'),
      nonce: nonceSchema,
      signal: signalSchema,
    })
    .strict(),
]);
export const reportFrameSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('hello'),
      nonce: nonceSchema,
      pid: z.number().int().positive(),
      identity: processIdentitySchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal('drained'),
      nonce: nonceSchema,
      code: z.number().int().min(0).max(255),
    })
    .strict(),
]);
export type ControlFrame = z.infer<typeof controlFrameSchema>;
export type ReportFrame = z.infer<typeof reportFrameSchema>;
export const encodeResourceFrame = (frame: ControlFrame | ReportFrame) =>
  `${JSON.stringify(frame)}\n`;

// Bound incomplete frames and a burst of complete, tiny frames.
export class ResourceFrameReader {
  private pending = Buffer.alloc(0);
  constructor(private readonly receive: (value: unknown) => void) {}
  push(chunk: Buffer) {
    let start = 0;
    let count = 0;
    for (let index = 0; index < chunk.length; index++) {
      if (chunk[index] !== 10) continue;
      const part = chunk.subarray(start, index);
      if (this.pending.length + part.length > 4096 || ++count > 16)
        throw new Error('Resource relay frame limit exceeded');
      const frame = Buffer.concat([this.pending, part]);
      this.pending = Buffer.alloc(0);
      start = index + 1;
      this.receive(JSON.parse(frame.toString('utf8')));
    }
    if (this.pending.length + chunk.length - start > 4096)
      throw new Error('Resource relay frame limit exceeded');
    this.pending = Buffer.concat([this.pending, chunk.subarray(start)]);
  }
  end() {
    if (this.pending.length) throw new Error('Truncated resource relay frame');
  }
}

export function resourceExitCode(
  code: number | null,
  signal: NodeJS.Signals | null
) {
  return code ?? (signal === 'SIGINT' ? 130 : signal === 'SIGHUP' ? 129 : 143);
}

export const sameProcessContext = (
  left: Omit<KernelProcessIdentity, 'birth'>,
  right: Omit<KernelProcessIdentity, 'birth'>
) =>
  left.backend === right.backend &&
  left.host === right.host &&
  left.boot === right.boot &&
  left.namespace === right.namespace;

export function resourceGroupInventory(
  snapshot: ProcessSnapshot,
  pid: number,
  identity: KernelProcessIdentity,
  anchored: boolean
): 'empty' | 'busy' | 'unknown' {
  if (snapshot.kind !== 'ready') return 'unknown';
  if (!snapshot.complete && !snapshot.unavailable.length) return 'unknown';
  if (!sameProcessContext(snapshot.context, identity)) return 'unknown';
  if (
    snapshot.unavailable.some(
      (item) => item.group === undefined || item.group === pid
    )
  )
    return 'unknown';
  const anchor = snapshot.processes.find((item) => item.pid === pid);
  if (
    anchored &&
    (!anchor ||
      anchor.group !== pid ||
      anchor.zombie ||
      !identityEqual(anchor.identity, identity))
  )
    return 'unknown';
  if (!anchored && anchor && !anchor.zombie) return 'unknown';
  return snapshot.processes.some(
    (item) => item.group === pid && item.pid !== pid && !item.zombie
  )
    ? 'busy'
    : 'empty';
}

/** Only invoked by the detached child; importing protocol helpers does no I/O. */
export function runResourceLauncher(
  command: string,
  args: string[],
  nonce: string
) {
  nonceSchema.parse(nonce);
  const own = observeProcess(process.pid);
  if (
    own.kind !== 'present' ||
    own.process.group !== process.pid ||
    own.process.zombie
  ) {
    console.error(
      'Resource relay identity unavailable; workload was not launched. Check the process identity backend.'
    );
    process.exit(1);
  }
  const identity = own.process.identity;
  try {
    setPriority(0, constants.priority.PRIORITY_BELOW_NORMAL);
  } catch {
    /* Advisory. */
  }
  let started = false;
  let finished = false;
  let launchRequested = false;
  let workloadEnvironment: NodeJS.ProcessEnv | undefined;
  let exitCode = 1;
  let diagnosticCount = 0;
  let nextDiagnostic = 0;
  let nextInspection = 0;
  const ownSignals = new Set<NodeJS.Signals>();
  const gate = createReadStream('', { fd: 3, autoClose: true });
  const report = (frame: ReportFrame) => {
    try {
      const bytes = Buffer.from(encodeResourceFrame(frame));
      return writeSync(4, bytes) === bytes.length;
    } catch {
      return false;
    }
  };
  const broadcast = (signal: (typeof resourceSignals)[number]) => {
    if (!started) process.exit(resourceExitCode(null, signal));
    if (ownSignals.has(signal)) return;
    ownSignals.add(signal);
    try {
      process.kill(0, signal);
    } catch {
      ownSignals.delete(signal);
      console.error(
        'Resource relay could not signal its own group; ownership remains reserved.'
      );
    }
  };
  for (const signal of resourceSignals)
    process.on(signal, () => {
      if (!ownSignals.delete(signal)) broadcast(signal);
    });

  const inspectDrain = () => {
    if (!finished || Date.now() < nextInspection) return;
    let state: ReturnType<typeof resourceGroupInventory> = 'unknown';
    try {
      state = resourceGroupInventory(
        snapshotProcesses(),
        process.pid,
        identity,
        true
      );
    } catch {
      /* Inspection failures retain the anchor. */
    }
    // Each snapshot scans every process; a held group needs no tight loop.
    if (state === 'busy') nextInspection = Date.now() + 250;
    if (state === 'unknown') nextInspection = Date.now() + 1000;
    if (state === 'empty') {
      report({ kind: 'drained', nonce, code: exitCode });
      process.exit(exitCode);
    }
    if (
      state === 'unknown' &&
      diagnosticCount < 3 &&
      Date.now() >= nextDiagnostic
    ) {
      diagnosticCount++;
      nextDiagnostic = Date.now() + 10_000;
      console.error(
        `Resource relay ${process.pid} cannot verify group drain; ownership remains reserved. Restore process inspection before retrying.`
      );
    }
  };
  const startPayload = () => {
    if (!launchRequested || !workloadEnvironment || started) return;
    started = true;
    try {
      // The relay inherited fds 3-5 without close-on-exec. Fresh pipes replace
      // them in the workload; closing our ends leaves only peerless pipes.
      const payload = spawn(command, args, {
        env: workloadEnvironment,
        stdio: ['inherit', 'inherit', 'inherit', 'pipe', 'pipe', 'pipe'],
        shell: false,
      });
      for (const stream of payload.stdio.slice(3)) stream?.destroy();
      payload.once('error', () => {
        exitCode = 1;
        finished = true;
      });
      payload.once('exit', (code, signal) => {
        exitCode = resourceExitCode(code, signal);
        finished = true;
      });
    } catch {
      exitCode = 1;
      finished = true;
    }

    workloadEnvironment = undefined;
  };
  const reader = new ResourceFrameReader((value) => {
    const frame = controlFrameSchema.parse(value);
    if (frame.nonce !== nonce) throw new Error('Resource relay nonce mismatch');
    if (frame.kind === 'cancel') {
      broadcast(frame.signal);
      return;
    }
    if (launchRequested) throw new Error('Duplicate resource launch');
    launchRequested = true;
    startPayload();
  });
  const disconnect = () => {
    gate.destroy();
    if (!started) process.exit(143);
    // A lost broker cannot revoke work already admitted with a durable receipt.
  };
  const environment = createReadStream('', { fd: 5, autoClose: true });
  const environmentChunks: Buffer[] = [];
  let environmentSize = 0;
  environment.on('data', (chunk) => {
    if (!Buffer.isBuffer(chunk)) {
      disconnect();
      return;
    }
    environmentSize += chunk.length;
    if (environmentSize > resourceEnvironmentLimit) {
      disconnect();
      return;
    }
    environmentChunks.push(chunk);
  });
  environment.once('error', disconnect);
  environment.once('end', () => {
    try {
      workloadEnvironment = decodeWorkloadEnvironment(
        Buffer.concat(environmentChunks),
        nonce
      );
      environmentChunks.length = 0;
      startPayload();
    } catch {
      console.error(
        'Resource relay rejected an invalid environment transfer; workload was not launched.'
      );
      disconnect();
    }
  });
  gate.on('data', (chunk) => {
    try {
      if (!Buffer.isBuffer(chunk))
        throw new Error('Invalid resource relay bytes');
      reader.push(chunk);
    } catch {
      console.error('Resource relay rejected an invalid control frame.');
      disconnect();
    }
  });
  gate.once('end', disconnect);
  gate.once('error', disconnect);
  if (!report({ kind: 'hello', nonce, pid: process.pid, identity }))
    process.exit(1);
  setInterval(inspectDrain, 25);
}
