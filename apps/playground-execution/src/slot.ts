import { DurableObject } from 'cloudflare:workers';
import { PlaygroundFiles } from '@tuturuuu/utils/playground-schema';
import { z } from 'zod';
import {
  type GuestInput,
  type GuestResult,
  runInFreshContainer,
} from './container-run';
import { coordinator, type Env } from './environment';
import {
  bytes,
  GuestJob,
  hex,
  readBoundedJson,
  type RunClaim,
  type RunIdentity,
} from './protocol';

const ASSIGNMENT = 'assignment';
const SEALED_INPUT = 'stdin';

interface Assignment {
  claim: RunClaim;
  identity: RunIdentity;
  revision: number;
  sourceTicket: string;
  exportTicket: string;
  phase: 'queued' | 'starting';
}

interface SealedInput {
  nonce: Uint8Array<ArrayBuffer>;
  ciphertext: ArrayBuffer;
}

async function inputKey(secret: string | undefined) {
  if (!secret || secret.length < 32)
    throw new Error('Playground callback secret missing');
  const key = await crypto.subtle.digest(
    'SHA-256',
    bytes(`playground-stdin-v1\0${secret}`)
  );
  return crypto.subtle.importKey('raw', key, 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
}

export class PlaygroundSlot extends DurableObject<Env> {
  private running?: {
    runId: string;
    stop: AbortController;
    settled: Promise<void>;
  };

  async assign(
    claim: RunClaim,
    identity: RunIdentity,
    revision: number,
    sourceTicket: string,
    exportTicket: string,
    stdin: string | undefined
  ): Promise<boolean> {
    let sealed: SealedInput | undefined;
    if (stdin) {
      const nonce = crypto.getRandomValues(new Uint8Array(12));
      const key = await inputKey(this.env.PLAYGROUND_INGRESS_SECRET);
      const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: nonce, additionalData: bytes(claim.run_id) },
        key,
        bytes(stdin)
      );
      sealed = { nonce, ciphertext };
    }
    return this.ctx.blockConcurrencyWhile(async () => {
      const active = await this.ctx.storage.get<Assignment>(ASSIGNMENT);
      if (active) return active.claim.run_id === claim.run_id;
      if (
        !this.ctx.container ||
        this.ctx.container.running ||
        Date.now() >= claim.deadline
      ) {
        return false;
      }
      // If the object faults between these writes, the alarm sees either a
      // complete assignment or no assignment. The coordinator retains expiry.
      await this.ctx.storage.transaction(async (tx) => {
        await tx.put(ASSIGNMENT, {
          claim,
          identity,
          revision,
          sourceTicket,
          exportTicket,
          phase: 'queued',
        });
        if (sealed) await tx.put(SEALED_INPUT, sealed);
        await tx.setAlarm(Date.now());
      });
      return true;
    });
  }

  async stop(claim: RunClaim): Promise<boolean> {
    const inFlight = this.running;
    if (inFlight?.runId === claim.run_id) {
      inFlight.stop.abort();
      await inFlight.settled;
    }
    return this.clear(claim.run_id);
  }

  private async clear(runId: string): Promise<boolean> {
    return this.ctx.blockConcurrencyWhile(async () => {
      const active = await this.ctx.storage.get<Assignment>(ASSIGNMENT);
      if (!active) return !this.ctx.container?.running;
      if (active.claim.run_id !== runId) return false;
      if (this.ctx.container?.running) await this.ctx.container.destroy();
      if (this.ctx.container?.running) return false;
      await this.ctx.storage.transaction(async (tx) => {
        await tx.delete([ASSIGNMENT, SEALED_INPUT]);
        await tx.deleteAlarm();
      });
      return true;
    });
  }

  async alarm() {
    const assigned = await this.ctx.storage.get<Assignment>(ASSIGNMENT);
    if (!assigned) return;
    const { claim } = assigned;
    if (assigned.phase === 'starting') {
      // A restart cannot determine whether the previous alarm executed code.
      // Terminate the instance and never replay the command.
      if (await this.clear(claim.run_id)) {
        await coordinator(this.env).complete(claim, 'failed');
      }
      return;
    }
    const stop = new AbortController();
    const settled = Promise.withResolvers<void>();
    this.running = { runId: claim.run_id, stop, settled: settled.promise };
    let result: GuestResult | undefined;
    let savedRevision: number | undefined;
    let finished = false;
    try {
      if (!(await coordinator(this.env).claimStart(claim))) return;
      if (stop.signal.aborted) return;
      await this.ctx.storage.put(ASSIGNMENT, {
        ...assigned,
        phase: 'starting',
      });
      const input = await this.source(assigned, stop.signal);
      if (!(await coordinator(this.env).mayExecute(claim))) return;
      if (stop.signal.aborted || !this.ctx.container) return;
      result = await runInFreshContainer(
        this.ctx.container,
        input,
        claim.deadline,
        stop.signal,
        () => coordinator(this.env).mayExecute(claim)
      );
      if (result.outcome === 'exited' && result.files !== undefined) {
        savedRevision = await this.saveFiles(
          assigned,
          input,
          result.files,
          stop.signal
        );
      }
      finished = true;
    } catch {
      // User input, provider bodies and internal credentials never go to logs.
      console.warn('Playground slot execution failed');
    } finally {
      try {
        if (await this.clear(claim.run_id)) {
          const terminal = stop.signal.aborted
            ? 'cancelled'
            : finished && result?.exitCode === 0 && result.outcome === 'exited'
              ? 'succeeded'
              : 'failed';
          await coordinator(this.env).complete(
            claim,
            terminal,
            result
              ? {
                  exitCode: finished ? result.exitCode : 126,
                  output: result.output,
                  savedRevision,
                }
              : undefined
          );
        }
      } finally {
        this.running = undefined;
        settled.resolve();
      }
    }
  }

  private async saveFiles(
    assignment: Assignment,
    input: GuestInput,
    exported: unknown,
    signal: AbortSignal
  ) {
    const files = PlaygroundFiles.parse(exported);
    const original = new Map(
      input.files.map(({ path, content }) => [path, content])
    );
    const changed = files.filter(
      ({ path, content }) => original.get(path) !== content
    );
    const paths = files.map(({ path }) => path);
    if (!changed.length && files.length === original.size) return undefined;
    const { claim, exportTicket, revision } = assignment;
    const origin = this.env.PLAYGROUND_SOURCE_ORIGIN;
    if (!origin || claim.deadline <= Date.now() || signal.aborted)
      throw new Error('Playground writeback expired');
    const url = new URL('/api/v1/internal/playground-execution/export', origin);
    if (url.protocol !== 'https:')
      throw new Error('Invalid Playground source origin');
    const baseline = Object.fromEntries(
      await Promise.all(
        input.files.map(async ({ path, content }) => [
          path,
          hex(
            new Uint8Array(
              await crypto.subtle.digest('SHA-256', bytes(content))
            )
          ),
        ])
      )
    );
    if (!(await coordinator(this.env).mayExecute(claim)) || signal.aborted) {
      throw new Error('Playground writeback cancelled');
    }
    const remaining = claim.deadline - Date.now();
    if (remaining < 1) throw new Error('Playground writeback expired');
    // The guest has already stopped. A Stop fences a new checkpoint claim,
    // but an in-flight claim can publish. Keep the bounded receipt wait alive
    // so the slot can reconcile a commit if Web cannot settle it directly.
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${exportTicket}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ revision, files: changed, paths, baseline }),
      redirect: 'manual',
      signal: AbortSignal.timeout(Math.min(15_000, remaining)),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error('Playground writeback failed');
    }
    return z
      .object({ revision: z.number().int().min(revision) })
      .parse(await readBoundedJson(response, 1024)).revision;
  }

  private async source(assignment: Assignment, signal: AbortSignal) {
    const { identity, revision, claim, sourceTicket } = assignment;
    const origin = this.env.PLAYGROUND_SOURCE_ORIGIN;
    const secret = this.env.PLAYGROUND_INGRESS_SECRET;
    if (!origin || !secret || secret.length < 32) {
      throw new Error('Playground source service unavailable');
    }
    const url = new URL('/api/v1/internal/playground-execution/source', origin);
    if (url.protocol !== 'https:')
      throw new Error('Invalid Playground source origin');
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sourceTicket}` },
      redirect: 'manual',
      signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error('Playground source lookup failed');
    }
    const job = GuestJob.parse(
      await readBoundedJson(response, 13 * 1024 * 1024)
    );
    if (
      job.projectId !== identity.projectId ||
      job.revision !== revision ||
      !job.files ||
      !job.command
    ) {
      throw new Error('Playground source changed');
    }
    const sealed = await this.ctx.storage.get<SealedInput>(SEALED_INPUT);
    let stdin: string | undefined;
    if (sealed) {
      const key = await inputKey(secret);
      const raw = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: sealed.nonce,
          additionalData: bytes(claim.run_id),
        },
        key,
        sealed.ciphertext
      );
      stdin = new TextDecoder('utf-8', { fatal: true }).decode(raw);
      await this.ctx.storage.delete(SEALED_INPUT);
    }
    return { command: job.command, files: job.files, stdin };
  }
}
