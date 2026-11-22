import { DurableObject } from 'cloudflare:workers';
import { parseCapacity, PlaygroundAdmission, type RunRow } from './admission';
import type { GuestResult } from './container-run';
import { type Env, executionSlot } from './environment';
import {
  identifyRun,
  projectScope,
  type RunClaim,
  type RunIdentity,
  type RunLookup,
  type RunSubmission,
  type RunWriteback,
} from './protocol';

type Terminal = 'succeeded' | 'failed' | 'cancelled';

function present(row: RunRow) {
  const active = row.state === 'reserved' || row.state === 'starting';
  const status =
    active && Date.now() >= row.deadline
      ? 'failed'
      : active && row.stop_requested
        ? 'cancel_requested'
        : row.state === 'reserved'
          ? 'queued'
          : row.state === 'starting'
            ? 'running'
            : row.state;
  return {
    runId: row.run_id,
    status,
    exitCode: row.exit_code,
    output: row.output,
    revision: row.result_revision ?? row.revision,
    saved: row.result_revision !== null,
  };
}

export class PlaygroundCoordinator extends DurableObject<Env> {
  private readonly admission: PlaygroundAdmission;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.admission = new PlaygroundAdmission(
      {
        query: (query, ...params) => ctx.storage.sql.exec(query, ...params),
        transaction: (callback) => ctx.storage.transactionSync(callback),
      },
      parseCapacity(env)
    );
  }

  async enqueue(submission: RunSubmission) {
    const identity = await identifyRun(submission);
    const admitted = await this.ctx.blockConcurrencyWhile(async () => {
      const reservation = this.admission.reserve(identity, Date.now());
      if (reservation.kind !== 'refused') await this.schedule();
      return reservation;
    });
    if (admitted.kind === 'refused') return admitted;
    const { run } = admitted;
    if (admitted.kind === 'new') {
      try {
        if (
          !(await executionSlot(this.env, run.slot).assign(
            run,
            {
              meetingId: submission.meetingId,
              ownerId: submission.ownerId,
              projectId: submission.projectId,
            },
            submission.revision,
            submission.sourceTicket,
            submission.exportTicket,
            submission.stdin
          ))
        ) {
          // The slot explicitly rejected this assignment. Only a confirmed
          // cleanup releases a slot that might still own a guest.
          await this.cleanup(run);
        }
      } catch {
        console.warn('Playground assignment outcome unconfirmed');
        // The deadline alarm reconciles the original reservation.
      }
    }
    return { kind: 'accepted' as const, runId: run.run_id };
  }

  read(lookup: RunLookup) {
    const row = this.admission.read({
      runId: lookup.runId,
      projectId: lookup.projectId,
      scopeId: projectScope(lookup),
    });
    return row ? present(row) : null;
  }

  async stop(identity: RunIdentity & { runId?: string }) {
    if (identity.runId) {
      const receipt = this.admission.read({
        runId: identity.runId,
        projectId: identity.projectId,
        scopeId: projectScope(identity),
      });
      if (receipt && receipt.finished_at !== null) {
        return { runId: receipt.run_id };
      }
    }
    const run = this.admission
      .active()
      .find(
        (row) =>
          row.project_id === identity.projectId &&
          row.scope_id === projectScope(identity) &&
          (!identity.runId || row.run_id === identity.runId)
      );
    if (!run) return null;
    await this.ctx.blockConcurrencyWhile(async () => {
      this.admission.requestStop(run);
      await this.schedule();
    });
    return { runId: run.run_id };
  }

  claimStart(claim: RunClaim) {
    return this.admission.claimStart(claim, Date.now());
  }

  mayExecute(claim: RunClaim) {
    return this.admission.mayExecute(claim, Date.now());
  }

  async complete(
    claim: RunClaim,
    state: Terminal,
    result?: Pick<GuestResult, 'exitCode' | 'output'> & {
      savedRevision?: number;
    }
  ) {
    await this.ctx.blockConcurrencyWhile(async () => {
      this.admission.finish(claim, state, Date.now(), result);
      await this.schedule();
    });
  }

  async writeback(lookup: RunWriteback, action: 'verify' | 'claim' | 'settle') {
    return this.ctx.blockConcurrencyWhile(async () => {
      const run = this.admission.read({
        runId: lookup.runId,
        projectId: lookup.projectId,
        scopeId: projectScope(lookup),
      });
      if (!run || run.revision !== lookup.revision) return false;
      const now = Date.now();
      if (action === 'verify') return this.admission.mayExecute(run, now);
      if (action === 'claim') return this.admission.claimWriteback(run, now);
      const settled = this.admission.settleWriteback(run, now);
      if (settled) await this.schedule();
      return settled || run.writeback_state === 2;
    });
  }

  async gate(enabled: boolean) {
    return this.ctx.blockConcurrencyWhile(async () => {
      const gate = this.admission.setEnabled(enabled);
      const active = this.admission.active().length;
      await this.schedule();
      return { ...gate, active };
    });
  }

  async alarm() {
    const due = await this.ctx.blockConcurrencyWhile(async () => {
      const now = Date.now();
      const claimed = this.admission
        .active()
        .filter(
          (run) =>
            run.cleanup_at !== null &&
            run.cleanup_at <= now &&
            this.admission.claimCleanup(run, now)
        );
      await this.schedule();
      return claimed;
    });
    await Promise.all(
      due.map(async (run) => {
        try {
          await this.cleanup(run);
        } catch {
          console.warn('Playground teardown outcome unconfirmed');
        }
      })
    );
  }

  private async cleanup(run: RunRow) {
    if (await executionSlot(this.env, run.slot).stop(run)) {
      await this.complete(run, 'failed');
    }
  }

  private async schedule() {
    const deadlines = this.admission
      .active()
      .flatMap((run) => (run.cleanup_at === null ? [] : [run.cleanup_at]));
    const next = deadlines.length ? Math.min(...deadlines) : null;
    const current = await this.ctx.storage.getAlarm();
    if (next === current) return;
    if (next === null) await this.ctx.storage.deleteAlarm();
    else await this.ctx.storage.setAlarm(next);
  }
}
