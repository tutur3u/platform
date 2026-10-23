import { accountKey, collapseAccounts } from './accounts';
import { matchingBlocks } from './block-ledger';
import { capacityCooldownActive } from './capacity';
import {
  MAX_FUTURE_OBSERVATION_SKEW_MS,
  recoveryAdmissionKey,
  usageLimitReceiptActive,
} from './failure-receipt';
import { HookError } from './hook-ledger';
import type {
  AdmissionContext,
  AdmissionRequest,
  HookLedger,
  Observation,
} from './hooks-types';
import { pruneLedger } from './ledger-retention';
import { recommend } from './policy';
import { poolPolicyReasons, settingsFor } from './pool-settings';
import { clearRecoveredLimits } from './receipt-expiry';
import { chooseRoleCandidate, rolePreferenceRank } from './role-policy';
import { coversModel, receiptCovers } from './window-scope';

export { accountKey } from './accounts';

export function recordObservation(
  ledger: HookLedger,
  input: Observation,
  now = new Date()
) {
  if (
    !Number.isFinite(Date.parse(input.observedAt)) ||
    Date.parse(input.observedAt) >
      now.getTime() + MAX_FUTURE_OBSERVATION_SKEW_MS
  )
    throw new HookError('observation-in-future');
  if (input.outcome === 'capacity-error' && !input.model)
    throw new HookError('capacity-model-required');
  if (input.outcome === 'capacity-error' && input.resetsAt)
    throw new HookError('capacity-reset-is-not-quota');
  if (
    input.nextEligibleAt &&
    (!Number.isFinite(Date.parse(input.nextEligibleAt)) ||
      Date.parse(input.nextEligibleAt) <= Date.parse(input.observedAt))
  )
    throw new HookError('next-eligible-before-observation');
  const previous = ledger.observations.find(
    (event) => event.eventId === input.eventId
  );
  if (previous) {
    const { clearedAt: _cleared, ...original } = previous;
    if (JSON.stringify(original) !== JSON.stringify(input))
      throw new HookError('observation-id-conflict');
    return { status: 'recorded', replay: true };
  }
  if (input.requestId) {
    const reservation = ledger.reservations.find(
      (item) => item.requestId === input.requestId
    );
    if (
      reservation &&
      (reservation.instanceId !== input.instanceId ||
        reservation.accountKey !== input.accountKey)
    )
      throw new HookError('observation-reservation-mismatch');
    if (
      reservation &&
      Date.parse(input.observedAt) < Date.parse(reservation.createdAt)
    )
      throw new HookError('observation-predates-reservation');
    if (reservation && input.nativeReservationId) {
      if (
        reservation.nativeReservationId &&
        reservation.nativeReservationId !== input.nativeReservationId
      )
        throw new HookError('native-reservation-rebind');
      if (
        ledger.reservations.some(
          (other) =>
            other !== reservation &&
            other.nativeReservationId === input.nativeReservationId
        )
      )
        throw new HookError('native-reservation-collision');
      reservation.nativeReservationId = input.nativeReservationId;
    }
    if (input.terminal !== false)
      ledger.reservations = ledger.reservations.filter(
        (item) => item.requestId !== input.requestId
      );
  }
  ledger.observations.push(input);
  return { status: 'recorded', replay: false };
}

export function admit(request: AdmissionRequest, context: AdmissionContext) {
  if (request.recovery)
    request = {
      ...request,
      requestId: recoveryAdmissionKey(
        request.recovery.threadId,
        request.recovery.runId,
        request.recovery.failure
      ),
    };
  const { accounts, active, ledger, now } = context;
  clearRecoveredLimits(context);
  pruneLedger(
    ledger,
    now,
    active.flatMap((item) => item.reservationIds ?? [])
  );
  const existing = ledger.reservations.find(
    (item) => item.requestId === request.requestId
  );
  if (existing) {
    if (existing.threadId !== request.threadId)
      throw new HookError('admission-id-conflict');
    return {
      status: 'block',
      reasons: ['admission-already-reserved'],
      reservation: {
        requestId: existing.requestId,
        threadId: existing.threadId,
        instanceId: existing.instanceId,
        model: existing.model,
        createdAt: existing.createdAt,
      },
      pools: [],
    };
  }
  if (
    ledger.observations.some((item) => item.requestId === request.requestId) ||
    ledger.retiredRequests?.some((item) => item.requestId === request.requestId)
  )
    return {
      status: 'block',
      reasons: ['admission-already-completed'],
      pools: [],
    };
  const current = accounts.find(
    (account) => account.instanceId === request.currentInstanceId
  );
  const author = accounts.find(
    (account) => account.instanceId === request.requirements.authorInstanceId
  );
  const pools = collapseAccounts(accounts)
    .map((originalPool) => {
      let pool = originalPool;
      const key = accountKey(pool);
      const ids = pool.instanceIds ?? [pool.instanceId];
      const candidates = request.requirements.candidates.filter((candidate) =>
        ids.includes(candidate.instanceId)
      );
      const unblockedCandidates = candidates.filter(
        (candidate) =>
          matchingBlocks(context.blocks ?? [], ids, candidate.model, now)
            .length === 0
      );
      const candidate = unblockedCandidates.find((candidate) => {
        const member = accounts.find(
          (account) => account.instanceId === candidate.instanceId
        );
        return (
          request.requirements.authorizedInstanceIds.includes(
            candidate.instanceId
          ) &&
          request.requirements.privacyApprovedInstanceIds.includes(
            candidate.instanceId
          ) &&
          candidate.capabilities.includes(request.requirements.capability) &&
          member?.available === true &&
          member.models?.includes(candidate.model)
        );
      });
      pool = {
        ...pool,
        windows: pool.windows.filter((window) =>
          coversModel(window, candidate?.model)
        ),
      };
      const nativeIds = new Set(
        active
          .filter((item) => ids.includes(item.instanceId))
          .flatMap((item) => item.reservationIds ?? [])
      );
      const reserved = ledger.reservations.filter(
        (item) =>
          (item.accountKey === key || ids.includes(item.instanceId)) &&
          (!item.nativeReservationId ||
            !nativeIds.has(item.nativeReservationId))
      ).length;
      const ranking = recommend({
        accounts: accounts
          .filter((member) => ids.includes(member.instanceId))
          .map((member) => ({
            ...member,
            windows: member.windows.filter((window) =>
              coversModel(window, candidate?.model)
            ),
          })),
        active: [
          ...active,
          {
            instanceId: pool.instanceId,
            count:
              reserved +
              (active.find((item) => item.instanceId === pool.instanceId)
                ?.count ?? 0),
          },
        ],
        task: { model: candidate?.model },
        now,
        hardLimitPercent: request.policy.nearUsedPercent,
      }).ranked[0];
      if (!ranking) throw new HookError('pool-ranking-missing');
      const reasons: string[] = ranking.reasons
        .filter(
          (reason) =>
            reason.code === 'concurrency-reserve' ||
            reason.code === 'reserved-excluded' ||
            reason.code === 'reserve'
        )
        .map((reason) => reason.code);
      if (ranking.reasons.some((reason) => reason.code === 'near-limit-stale'))
        reasons.push('pool-near-limit');
      if (candidates.length && !unblockedCandidates.length)
        reasons.push('observed-block-ledger');
      const quotaFresh = ranking.state !== 'UNKNOWN';
      let state: 'FRESH' | 'STALE' | 'UNKNOWN' | 'EXHAUSTED' = quotaFresh
        ? ranking.state === 'exhausted'
          ? 'EXHAUSTED'
          : 'FRESH'
        : pool.windows.some((window) => window.authoritative)
          ? 'STALE'
          : 'UNKNOWN';
      const resetTimes = pool.windows
        .map((window) => window.resetsAt)
        .filter(
          (value): value is string =>
            Boolean(value) && Number.isFinite(Date.parse(value as string))
        );
      let resetAt = resetTimes.sort().at(0) ?? null;
      const failures = ledger.observations.filter(
        (event) =>
          (event.accountKey === key || ids.includes(event.instanceId)) &&
          event.outcome === 'usage-limit' &&
          receiptCovers(event, pool.provider, candidate?.model) &&
          !event.clearedAt &&
          usageLimitReceiptActive(event, now)
      );
      if (failures.length) {
        state = 'EXHAUSTED';
        resetAt = failures.some((event) => !event.resetsAt)
          ? null
          : (failures
              .map((event) => event.resetsAt as string)
              .sort()
              .at(-1) ?? null);
        reasons.push('observed-usage-limit');
      }
      if (state === 'EXHAUSTED') reasons.push('pool-exhausted');
      if (quotaFresh && ranking.state === 'near')
        reasons.push('pool-near-limit');
      if (
        ledger.observations.some(
          (event) =>
            (event.accountKey === key || ids.includes(event.instanceId)) &&
            capacityCooldownActive(event, candidate?.model, now)
        )
      )
        reasons.push('capacity-cooldown');
      const count =
        ids.reduce(
          (total, id) =>
            total + (active.find((item) => item.instanceId === id)?.count ?? 0),
          0
        ) + reserved;
      reasons.push(
        ...poolPolicyReasons(pool, candidate?.model, count, context)
      );
      if (
        (state === 'UNKNOWN' || state === 'STALE') &&
        count >= request.policy.unknownMaxConcurrent
      )
        reasons.push('unknown-reservation-cap');
      if (!current) reasons.push('requesting-account-unverified');
      if (
        current &&
        !ids.includes(current.instanceId) &&
        current.provider === pool.provider &&
        (!current.accountIdentityHash || !pool.accountIdentityHash)
      )
        reasons.push('orchestrator-account-identity-unverified');
      if (
        current &&
        (ids.includes(current.instanceId) || accountKey(current) === key)
      ) {
        const remaining = quotaFresh
          ? Math.min(
              ...pool.windows
                .filter(
                  (window) =>
                    window.authoritative && window.usedPercent !== undefined
                )
                .map((window) => 100 - (window.usedPercent as number))
            )
          : null;
        if (
          remaining === null ||
          remaining <= request.policy.orchestratorReservePercent
        )
          reasons.push('orchestrator-reserve');
      }
      if (request.requirements.capability === 'review') {
        if (!author) reasons.push('review-author-unverified');
        else if (ids.includes(author.instanceId) || accountKey(author) === key)
          reasons.push('reviewer-independence');
        else if (
          author.provider === pool.provider &&
          (!author.accountIdentityHash || !pool.accountIdentityHash)
        )
          reasons.push('reviewer-account-identity-unverified');
      }
      if (!candidate)
        reasons.push('capability-privacy-or-authorization-unverified');
      const preferenceWeight = Math.max(
        ...ids.map(
          (id) =>
            request.policy.preferenceWeights?.[id] ??
            settingsFor(pool, context)?.preference ??
            (pool.provider === 'codex' ? 4 : 1)
        )
      );
      return {
        preferenceWeight,
        provider: pool.provider,
        rolePreference: rolePreferenceRank(
          request.policy.orchestratorRole,
          pool.provider,
          state === 'FRESH' &&
            ranking.state === 'healthy' &&
            reasons.length === 0 &&
            Boolean(candidate)
        ),
        orderingScore: ranking.score + preferenceWeight,
        pool: pool.instanceId,
        instanceIds: ids,
        state,
        telemetryReasons: pool.windows.length
          ? []
          : ['no-covering-usage-window'],
        candidateModel: candidate?.model ?? null,
        quotaState: state === 'STALE' ? 'UNKNOWN' : state,
        ageMs: ranking.ageMs,
        resetAt,
        activeReservations: count,
        score: ranking.score,
        reasons,
        candidate,
        accountKey: key,
      };
    })
    .sort(
      (a, b) =>
        b.rolePreference - a.rolePreference ||
        Number(b.state === 'FRESH') - Number(a.state === 'FRESH') ||
        b.orderingScore - a.orderingScore ||
        a.pool.localeCompare(b.pool)
    );
  const eligiblePools = pools.filter(
    (pool) => pool.reasons.length === 0 && pool.candidate
  );
  const eligibleClaude = eligiblePools.filter(
    (pool) => pool.provider === 'claude'
  );
  const selected = chooseRoleCandidate(
    request.policy.orchestratorRole,
    eligiblePools,
    request.policy.allowNonClaudeFallback
  ).candidate;
  const publicPools = pools.map(
    ({
      accountKey: _key,
      candidate: _candidate,
      rolePreference: _role,
      ...pool
    }) => pool
  );
  if (!selected?.candidate)
    return {
      status: 'block',
      reasons: [
        request.policy.orchestratorRole === 'main' && !eligibleClaude.length
          ? 'main-role-no-eligible-claude'
          : 'no-eligible-pool',
      ],
      pools: publicPools,
    };
  ledger.reservations.push({
    requestId: request.requestId,
    threadId: request.threadId,
    instanceId: selected.candidate.instanceId,
    accountKey: selected.accountKey,
    model: selected.candidate.model,
    createdAt: now.toISOString(),
  });
  const member = accounts.find(
    (account) => account.instanceId === selected.candidate?.instanceId
  );
  const effort =
    request.requirements.taskClass === 'security-review'
      ? 'high'
      : request.requirements.taskClass === 'mechanical'
        ? 'low'
        : 'medium';
  const option = member?.modelOptions?.[selected.candidate.model]?.find(
    (option) =>
      (option.id === 'reasoningEffort' || option.id === 'effort') &&
      option.values.includes(effort)
  );
  return {
    status: 'admit',
    suggestedOptions: option ? { [option.id]: effort } : {},
    planningNotes: [
      'Preference weights are user planning inputs, not measured budget or headroom.',
      'Extra ChatGPT reset credit is unverified planning information; no credit is used or activated.',
    ],
    chosen: {
      providerInstanceId: selected.candidate.instanceId,
      model: selected.candidate.model,
    },
    reservationId: request.requestId,
    reasons: [
      selected.state === 'FRESH'
        ? 'fresh-headroom'
        : 'bounded-unknown-admission',
      'capability-privacy-authorization-approved',
      ...(request.policy.orchestratorRole === 'main' &&
      selected.provider !== 'claude'
        ? ['main-role-explicit-non-claude-fallback']
        : []),
      'reservation-recorded',
    ],
    pools: publicPools,
  };
}
