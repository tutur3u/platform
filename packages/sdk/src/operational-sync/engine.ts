import { randomUUID } from 'node:crypto';
import {
  canonical,
  digest,
  type Event,
  fail,
  type Outcome,
  outcomeSchema,
  type Proposal,
  proposalBinding,
  proposalSchema,
  type Receipt,
  requireAuthority,
  type State,
  stateSchema,
  verifyEvent,
} from './protocol';

export function initialState(
  scope: State['scope'],
  serverStoreId: string = randomUUID()
): State {
  return stateSchema.parse({
    version: 1,
    scope,
    serverStoreId,
    events: [],
    outcomes: [],
    operations: [],
  });
}
export function applyProposal(
  current: State,
  input: unknown,
  authority: unknown,
  now: number
): { state: State; receipt: Receipt } {
  validateOperationHistory(current);
  const proposal = proposalSchema.parse(input);
  if (now < (current.events.at(-1)?.at ?? 0)) fail('server_clock_regressed');
  if (!Number.isSafeInteger(now) || now < 0) fail('invalid_server_clock');
  if (canonical(current.scope) !== canonical(proposal.scope))
    fail('foreign_scope');
  const capability = ['acquire', 'renew', 'release'].includes(
    proposal.command.kind
  )
    ? 'ownership:claim'
    : 'planning:write';
  const binding = proposalBinding(proposal);
  requireAuthority(authority, binding, capability, now);
  const inputHash = digest(proposal);
  const prior = current.operations.find(
    (o) => o.operationId === proposal.operationId
  );
  if (prior) {
    if (prior.hash !== inputHash) fail('operation_id_conflict');
    return { state: current, receipt: prior.receipt };
  }
  if (current.operations.length >= 20_000) fail('operation_capacity');
  const state = structuredClone(current);
  const outcome = state.outcomes.find((o) => o.id === proposal.outcomeId);
  let receipt: Receipt;
  if (
    (outcome?.revision ?? 0) !== proposal.expectedRevision ||
    (outcome?.lastHash ?? null) !== proposal.previousOutcomeHash
  ) {
    receipt = {
      kind: 'conflict',
      operationId: proposal.operationId,
      currentRevision: outcome?.revision ?? 0,
      currentHash: outcome?.lastHash ?? null,
      proposed: proposal,
    };
  } else {
    if (state.events.length >= 10_000) fail('event_capacity');
    if (!outcome && state.outcomes.length >= 1000) fail('outcome_capacity');
    const projection = projectOutcome(outcome, proposal, now);
    const body = {
      version: 1 as const,
      serverStoreId: state.serverStoreId,
      cursor: state.events.length + 1,
      previousHash: state.events.at(-1)?.hash ?? null,
      proposal,
      at: now,
      outcome: projection,
    };
    const event: Event = verifyEvent({ ...body, hash: digest(body) });
    const updated = outcomeSchema.parse({
      ...projection,
      lastHash: event.hash,
    });
    state.outcomes = [
      ...state.outcomes.filter((o) => o.id !== updated.id),
      updated,
    ];
    state.events.push(event);
    receipt = { kind: 'accepted', event };
  }
  state.operations.push({
    operationId: proposal.operationId,
    hash: inputHash,
    receipt,
  });
  return { state: stateSchema.parse(state), receipt };
}

export function projectOutcome(
  outcome: Outcome | undefined,
  proposal: Proposal,
  now: number
): Omit<Outcome, 'lastHash'> {
  const binding = proposalBinding(proposal);
  if (outcome?.deleted) fail('tombstone_fence');
  const command = proposal.command;
  let projection: Omit<Outcome, 'lastHash'>;
  if (command.kind === 'create') {
    if (outcome) fail('outcome_exists');
    projection = {
      id: proposal.outcomeId,
      revision: 1,
      title: command.title,
      completion: 'open' as const,
      deleted: false,
      fence: 0,
      lease: null,
    };
  } else {
    if (!outcome) fail('unknown_outcome');
    const { lastHash: _hash, ...previous } = outcome;
    projection = { ...previous, revision: outcome.revision + 1 };
    if (command.kind === 'acquire') {
      if (outcome.lease && outcome.lease.expiresAt > now) fail('lease_busy');
      if (command.expectedFence !== outcome.fence) fail('stale_fence');
      if (outcome.fence >= Number.MAX_SAFE_INTEGER) fail('fence_capacity');
      projection.fence = outcome.fence + 1;
      projection.lease = {
        fence: projection.fence,
        binding,
        expiresAt: now + command.ttlMs,
      };
    } else {
      const lease = outcome.lease;
      if (
        !lease ||
        lease.expiresAt <= now ||
        command.fence !== lease.fence ||
        canonical(lease.binding) !== canonical(binding)
      )
        fail('stale_or_foreign_lease');
      if (command.kind === 'renew')
        projection.lease = { ...lease, expiresAt: now + command.ttlMs };
      else if (command.kind === 'release') projection.lease = null;
      else if (command.kind === 'tombstone') {
        projection.deleted = true;
        projection.lease = null;
      } else {
        projection.title = command.title;
        projection.completion = command.completion;
      }
    }
  }
  return projection;
}

export function validateOperationHistory(state: State) {
  const records = new Map<string, State['operations'][number]>();
  const ancestors = new Map(
    state.events.map((event) => [
      `${event.outcome.id}:${event.outcome.revision}`,
      event,
    ])
  );
  for (const operation of state.operations) {
    if (records.has(operation.operationId)) fail('duplicate_operation_receipt');
    records.set(operation.operationId, operation);
    const receipt = operation.receipt;
    const proposal =
      receipt.kind === 'accepted' ? receipt.event.proposal : receipt.proposed;
    if (
      operation.operationId !== proposal.operationId ||
      operation.hash !== digest(proposal) ||
      canonical(proposal.scope) !== canonical(state.scope)
    )
      fail('operation_receipt_mismatch');
    if (receipt.kind === 'accepted') {
      const event = verifyEvent(receipt.event);
      if (
        canonical(state.events[event.cursor - 1] ?? null) !== canonical(event)
      )
        fail('operation_history_mismatch');
    } else {
      if (receipt.operationId !== proposal.operationId)
        fail('operation_receipt_mismatch');
      const ancestor = ancestors.get(
        `${proposal.outcomeId}:${receipt.currentRevision}`
      );
      if (
        receipt.currentRevision === 0
          ? receipt.currentHash !== null
          : !ancestor || ancestor.hash !== receipt.currentHash
      )
        fail('conflict_ancestry_mismatch');
      if (
        proposal.expectedRevision === receipt.currentRevision &&
        proposal.previousOutcomeHash === receipt.currentHash
      )
        fail('invalid_conflict_receipt');
    }
  }
  for (const event of state.events) {
    const receipt = records.get(event.proposal.operationId)?.receipt;
    if (
      receipt?.kind !== 'accepted' ||
      canonical(receipt.event) !== canonical(event)
    )
      fail('missing_event_receipt');
  }
}
