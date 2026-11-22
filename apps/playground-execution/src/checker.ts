import { DurableObject } from 'cloudflare:workers';
import {
  type CheckDiagnostic,
  type CheckLanguage,
  checkSources,
  parseDiagnostics,
} from './check-diagnostics';
import { LAUNCHER, readGuestStream } from './container-run';
import type { Env } from './environment';

// One warm compile-only guest per room, on the smallest instance. It stops
// after 90 seconds without checks and is replaced after 30 minutes.
const IDLE_TIMEOUT_MS = 90_000;
const MAX_GUEST_LIFETIME_MS = 30 * 60_000;
const WARMING_GRACE_MS = 20_000;
// Four seconds longer than the guest's own limit, so the guest ends a slow
// check itself.
const CHECK_TIMEOUT_MS = { c: 8_000, cpp: 8_000, java: 12_000 } as const;
const FENCED_AT = 'fencedAt';
const MAX_CONCURRENT_CHECKS = 2;
// 64 KiB of compiler output can grow sixfold as ASCII-escaped JSON.
const MAX_GUEST_RESPONSE_BYTES = 400 * 1024;
const STARTED_AT = 'startedAt';

export interface CheckJob {
  requester: string;
  /** When the coordinator admitted the check; a later pause fences it. */
  admittedAt: number;
  language: CheckLanguage;
  files: { path: string; content: string }[];
  entry?: string;
}

export type CheckOutcome =
  | {
      kind: 'checked';
      diagnostics: CheckDiagnostic[];
      truncated: boolean;
      durationMs: number;
    }
  | {
      kind: 'refused';
      reason:
        | 'check_warming'
        | 'check_busy'
        | 'check_superseded'
        | 'check_unavailable';
    };

function guestOutput(value: unknown) {
  if (
    !value ||
    typeof value !== 'object' ||
    !('output' in value) ||
    typeof value.output !== 'string' ||
    !('outcome' in value) ||
    typeof value.outcome !== 'string'
  ) {
    throw new Error('Invalid Playground check response');
  }
  return { output: value.output, outcome: value.outcome };
}

export class PlaygroundChecker extends DurableObject<Env> {
  private readonly inFlight = new Map<string, AbortController>();

  /** Stops every check and the guest; the pause fence and the lifetime use it. */
  async shutdown(fence = true): Promise<boolean> {
    // Fence first, so a check admitted before this point cannot start a
    // guest after it, then clear the lifetime state before destroying.
    if (fence) await this.ctx.storage.put(FENCED_AT, Date.now());
    for (const controller of this.inFlight.values()) controller.abort();
    this.inFlight.clear();
    await this.ctx.storage.delete(STARTED_AT);
    await this.ctx.storage.deleteAlarm();
    const container = this.ctx.container;
    if (container?.running) await container.destroy();
    return !container?.running;
  }

  async alarm() {
    await this.shutdown(false);
  }

  async check(job: CheckJob): Promise<CheckOutcome> {
    const container = this.ctx.container;
    const image = container?.images.toolchain;
    if (!container || !image)
      return { kind: 'refused', reason: 'check_unavailable' };
    const fencedAt = await this.ctx.storage.get<number>(FENCED_AT);
    if (fencedAt !== undefined && job.admittedAt <= fencedAt)
      return { kind: 'refused', reason: 'check_unavailable' };
    const now = Date.now();
    const startedAt = await this.ctx.storage.get<number>(STARTED_AT);
    if (
      container.running &&
      (startedAt === undefined || now - startedAt > MAX_GUEST_LIFETIME_MS) &&
      this.inFlight.size === 0
    ) {
      await container.destroy();
    }
    if (!container.running) {
      container.start({ image, enableInternet: false, instance: 'basic' });
      await container.setInactivityTimeout(IDLE_TIMEOUT_MS);
      await this.ctx.storage.put(STARTED_AT, now);
      // The lifetime holds even under continuous checks.
      await this.ctx.storage.setAlarm(now + MAX_GUEST_LIFETIME_MS);
      return { kind: 'refused', reason: 'check_warming' };
    }
    // A newer check from the same person replaces the one still compiling.
    this.inFlight.get(job.requester)?.abort();
    this.inFlight.delete(job.requester);
    if (this.inFlight.size >= MAX_CONCURRENT_CHECKS)
      return { kind: 'refused', reason: 'check_busy' };
    const superseded = new AbortController();
    this.inFlight.set(job.requester, superseded);
    const timeout = AbortSignal.timeout(CHECK_TIMEOUT_MS[job.language]);
    const paths = job.files.map(({ path }) => path);
    const started = Date.now();
    try {
      const process = await container.exec(LAUNCHER, {
        user: '0:0',
        stdin: new Blob([
          JSON.stringify({
            mode: 'check',
            language: job.language,
            files: job.files,
            sources: checkSources(job.language, paths, job.entry),
          }),
        ]).stream(),
        stderr: 'ignore',
        signal: AbortSignal.any([superseded.signal, timeout]),
      });
      const stop = () => process.kill();
      superseded.signal.addEventListener('abort', stop, { once: true });
      timeout.addEventListener('abort', stop, { once: true });
      // A supersede or timeout that landed while exec was starting.
      if (superseded.signal.aborted || timeout.aborted) {
        stop();
        throw new Error('Playground check stopped');
      }
      const [raw, exitCode] = await Promise.all([
        readGuestStream(process.stdout, MAX_GUEST_RESPONSE_BYTES),
        process.exitCode,
      ]);
      if (exitCode !== 0) throw new Error('Playground check launcher failed');
      const { output, outcome } = guestOutput(JSON.parse(raw));
      if (outcome === 'sandbox_failed' || outcome === 'timeout')
        return { kind: 'refused', reason: 'check_unavailable' };
      return {
        kind: 'checked',
        ...parseDiagnostics(
          job.language,
          paths,
          output,
          outcome === 'output_limit'
        ),
        durationMs: Date.now() - started,
      };
    } catch {
      if (superseded.signal.aborted)
        return { kind: 'refused', reason: 'check_superseded' };
      // A guest that is still booting refuses exec; ask the client to retry.
      const booting =
        !timeout.aborted &&
        startedAt !== undefined &&
        Date.now() - startedAt < WARMING_GRACE_MS;
      return {
        kind: 'refused',
        reason: booting ? 'check_warming' : 'check_unavailable',
      };
    } finally {
      if (this.inFlight.get(job.requester) === superseded)
        this.inFlight.delete(job.requester);
    }
  }
}
