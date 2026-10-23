import { readFileSync } from 'node:fs';
import { accountKey, admit, recordObservation } from './admission';
import { CAPACITY_COOLDOWN_MS } from './capacity';
import { collectAll } from './collectors';
import { collectChildren, collectPoolReceipts } from './collectors/children';
import { MAX_FUTURE_OBSERVATION_SKEW_MS } from './failure-receipt';
import { checkHandover } from './handover';
import {
  admissionInput,
  bool,
  id,
  number,
  object,
  switchInput,
  timestamp,
} from './hook-input';
import { HookError, readLedger, transactLedger } from './hook-ledger';
import { reconcileChildren, recoveryBlockers } from './reconcile-children';
import { applyDescendantReceipts, applyRecoveryReceipt } from './recovery';
import {
  acquireSwitchLease,
  checkSwitch,
  releaseSwitchLease,
} from './switch-safety';

export async function runHook(command: string, action?: string): Promise<void> {
  try {
    const source = readFileSync(0, 'utf8');
    if (Buffer.byteLength(source) > 1_000_000)
      throw new HookError('input-too-large');
    const input = object(JSON.parse(source));
    const now = new Date();
    // This path never calls a provider probe; receipt collection selects only terminal provider-limit text.
    const collected = await collectAll({
      snapshotsOnly: true,
      catalog: input.catalog,
    });
    let result: unknown;
    if (command === 'admit') {
      if (collected.active === undefined)
        throw new HookError('reservation-state-unavailable');
      const active = collected.active;
      const request = admissionInput(input);
      const descendants = collectChildren(request.threadId);
      const poolReceipts = collectPoolReceipts(
        collected.accounts.map((account) => account.instanceId),
        now
      );
      let recoveryEntry: Record<string, unknown> | undefined;
      if (request.recovery) {
        const evidence =
          input.recoveryEvidence === undefined
            ? undefined
            : object(input.recoveryEvidence);
        const drain = evidence
          ? {
              [request.recovery.threadId]: {
                observedAt: timestamp(evidence.observedAt),
                drained: bool(evidence.drained),
              },
            }
          : {};
        const entries = reconcileChildren(
          descendants,
          request.threadId,
          now,
          typeof input.recoveryTimezone === 'string'
            ? input.recoveryTimezone
            : undefined,
          drain
        ).entries;
        const entry = entries.find(
          (entry) =>
            entry.threadId === request.recovery?.threadId &&
            entry.runId === request.recovery?.runId &&
            entry.failureClass === request.recovery?.failure
        );
        recoveryEntry = entry;
        const blockers = recoveryBlockers(entry);
        if (blockers.length) {
          console.log(JSON.stringify({ status: 'block', reasons: blockers }));
          return;
        }
      }

      result = await transactLedger((ledger) => {
        const context = { ...collected, active, ledger, now };
        applyDescendantReceipts(
          poolReceipts,
          context,
          typeof input.recoveryTimezone === 'string'
            ? input.recoveryTimezone
            : undefined
        );
        if (recoveryEntry) applyRecoveryReceipt(recoveryEntry, context);
        return admit(request, context);
      });
    } else {
      const instanceId = id(input.instanceId);
      const account = collected.accounts.find(
        (item) => item.instanceId === instanceId
      );
      if (!account) throw new HookError('account-unverified');
      const key = accountKey(account);
      if (command === 'observe') {
        const outcome = input.outcome;
        if (
          outcome !== 'success' &&
          outcome !== 'usage-limit' &&
          outcome !== 'capacity-error'
        )
          throw new HookError('outcome-invalid');
        const observedAt = timestamp(input.observedAt);
        if (
          Date.parse(observedAt) >
          now.getTime() + MAX_FUTURE_OBSERVATION_SKEW_MS
        )
          throw new HookError('observation-in-future');
        const resetsAt =
          input.resetsAt === undefined ? undefined : timestamp(input.resetsAt);
        if (resetsAt && Date.parse(resetsAt) <= Date.parse(observedAt))
          throw new HookError('reset-before-observation');
        result = await transactLedger((ledger) =>
          recordObservation(
            ledger,
            {
              eventId: id(input.eventId),
              terminal:
                input.terminal === undefined ? true : bool(input.terminal),
              nativeReservationId:
                input.nativeReservationId === undefined
                  ? undefined
                  : id(input.nativeReservationId),
              instanceId,
              accountKey: key,
              outcome,
              model: input.model === undefined ? undefined : id(input.model),
              nextEligibleAt:
                outcome === 'capacity-error'
                  ? input.nextEligibleAt === undefined
                    ? new Date(
                        Date.parse(observedAt) + CAPACITY_COOLDOWN_MS
                      ).toISOString()
                    : timestamp(input.nextEligibleAt)
                  : undefined,
              observedAt,
              resetsAt,
              requestId:
                input.requestId === undefined ? undefined : id(input.requestId),
            },
            now
          )
        );
      } else if (command === 'switch-lease') {
        const identity = {
          threadId: id(input.threadId),
          attemptId: id(input.attemptId),
          accountKey: key,
          pid: number(input.pid, 1, 2_147_483_647),
          processStartedAt: timestamp(input.processStartedAt),
        };
        if (action === 'acquire') {
          const pid = number(input.pid, 1, 2_147_483_647);
          if (!Number.isInteger(pid)) throw new HookError('pid-invalid');
          const processStartedAt = timestamp(input.processStartedAt);
          if (Date.parse(processStartedAt) > now.getTime())
            throw new HookError('process-start-in-future');
          const ttlMs = number(input.ttlMs, 1000, 300_000);
          result = await transactLedger((ledger) =>
            acquireSwitchLease(
              ledger,
              { ...identity, pid, processStartedAt, ttlMs },
              now
            )
          );
        } else if (action === 'release')
          result = await transactLedger((ledger) =>
            releaseSwitchLease(ledger, identity, now)
          );
        else throw new HookError('lease-action-invalid');
      } else if (command === 'handover-check') {
        const current = collected.accounts.find(
          (item) => item.instanceId === id(input.currentInstanceId)
        );
        if (!current) throw new HookError('requesting-account-unverified');
        const handover = object(input.handover);
        const successorCount = number(handover.successorCount, 0, 1000);
        if (!Number.isInteger(successorCount))
          throw new HookError('successor-count-invalid');
        result = checkHandover(
          await readLedger(),
          current,
          switchInput(input, key),
          {
            inThreadSwitchSupported: bool(handover.inThreadSwitchSupported),
            successorCount,
            oldWriterDrainedOrStopped: bool(handover.oldWriterDrainedOrStopped),
            sourcePreserved: bool(handover.sourcePreserved),
            dirtyFilesPreserved: bool(handover.dirtyFilesPreserved),
            indexPreserved: bool(handover.indexPreserved),
            jobsPreserved: bool(handover.jobsPreserved),
            childParentsPreserved: bool(handover.childParentsPreserved),
            questionsPreserved: bool(handover.questionsPreserved),
            watchesPreserved: bool(handover.watchesPreserved),
            unknownWritesPreserved: bool(handover.unknownWritesPreserved),
            bindingVerified: bool(handover.bindingVerified),
            successorIndependentlyAccepted: bool(
              handover.successorIndependentlyAccepted
            ),
            acceptanceRecorded: bool(handover.acceptanceRecorded),
          },
          now
        );
      } else
        result = checkSwitch(await readLedger(), switchInput(input, key), now);
    }
    console.log(
      JSON.stringify(
        result && typeof result === 'object'
          ? {
              ...(result as Record<string, unknown>),
              invalidObservations: collected.invalidObservations ?? [],
            }
          : result,
        (key, value) =>
          key === 'accountKey' || key === 'accountIdentityHash'
            ? undefined
            : value
      )
    );
  } catch (error) {
    console.log(
      JSON.stringify({
        status: 'block',
        reasons: [
          error instanceof HookError
            ? error.message
            : 'hook-input-or-state-unavailable',
        ],
        retryable:
          error instanceof HookError &&
          error.message === 'ledger-contention-retry',
      })
    );
    process.exitCode =
      error instanceof HookError && error.message === 'ledger-contention-retry'
        ? 3
        : 1;
  }
}
