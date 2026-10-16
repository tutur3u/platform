import { canonical, fail } from '../cli/operational-schema';
import { buildOutcomeProjectionPage } from '../operational-graph/projection';
import {
  advisoryScoresSchema,
  type PlannerContext,
  type PlannerIdentity,
  plannerContextSchema,
} from './contracts';

export function samePlannerIdentity(a: PlannerIdentity, b: PlannerIdentity) {
  return (
    a.sourceDatabaseId === b.sourceDatabaseId &&
    a.revision === b.revision &&
    a.snapshotHash === b.snapshotHash
  );
}

export function validatePlannerContext(input: unknown): PlannerContext {
  const context = plannerContextSchema.parse(input);
  const { snapshot, graph, expected, reservations, grant } = context;
  if (snapshot.sourceDatabaseId === null || snapshot.items.length > 500)
    fail(
      'PLANNER_IDENTITY',
      'identified complete graph of at most 500 items required'
    );
  if (
    snapshot.items.some(
      (item) => item.priority === undefined || item.dependencies === undefined
    )
  )
    fail('PLANNER_LEGACY', 'explicit priority and dependencies required');
  // Rebuild from complete contiguous history; reuse graph and evidence validation.
  const rebuilt = buildOutcomeProjectionPage({ snapshot, limit: 500 });
  if (graph.nextCursor !== null || canonical(graph) !== canonical(rebuilt))
    fail('PLANNER_GRAPH', 'complete canonical singleton graph required');
  if (
    !samePlannerIdentity(expected, {
      sourceDatabaseId: snapshot.sourceDatabaseId,
      revision: rebuilt.revision,
      snapshotHash: rebuilt.snapshotHash,
    })
  )
    fail('PLANNER_STALE', 'source identity differs from expected identity');
  const ids = new Set(snapshot.items.map((item) => item.id));
  const reservationIds = new Set(reservations.map((r) => r.reservationId));
  if (
    reservations.length !== ids.size ||
    reservationIds.size !== ids.size ||
    new Set(reservations.map((r) => r.canonicalItemId)).size !== ids.size ||
    reservations.some(
      (r) =>
        !ids.has(r.canonicalItemId) ||
        !samePlannerIdentity(r.identity, expected)
    )
  )
    fail(
      'PLANNER_RESERVATION',
      'explicit unique revision-bound reservation for every item required'
    );
  if (
    !samePlannerIdentity(grant.identity, expected) ||
    !ids.has(grant.canonicalItemId)
  )
    fail(
      'PLANNER_GRANT',
      'grant belongs to a different source revision or item'
    );
  return context;
}

export function plannerDenial(
  context: PlannerContext,
  canonicalItemId: string
): string | null {
  const item = context.snapshot.items.find(
    (item) => item.id === canonicalItemId
  );
  if (!item) return 'unknown-canonical-item';
  if (!['captured', 'ready'].includes(item.status) || item.owner.trim())
    return 'already-owned-or-ineligible-state';
  if (context.globalP0Hold && item.priority !== 0) return 'global-p0-hold';
  if (
    (item.invalidatedDependencies ?? []).length ||
    (item.dependencies ?? []).some(
      (id) =>
        context.snapshot.items.find((dependency) => dependency.id === id)
          ?.status !== 'verified'
    )
  )
    return 'dependency-pending';
  const reservation = context.reservations.find(
    (r) => r.canonicalItemId === canonicalItemId
  );
  const grant = context.grant;
  if (!grant.allowed || grant.canonicalItemId !== canonicalItemId)
    return 'coordinator-grant-denied';
  if (
    reservation?.kind !== 'reserved' ||
    reservation.owner !== grant.owner ||
    reservation.reservationId !== grant.reservationId
  )
    return 'reservation-conflict';
  return null;
}

export function planOperationalWork({
  context: input,
  scores: scoreInput = [],
}: {
  context: unknown;
  scores?: unknown;
}) {
  const context = validatePlannerContext(input);
  const scores = advisoryScoresSchema.parse(scoreInput);
  const scoreMap = new Map(
    scores.map((score) => [score.canonicalItemId, score.score])
  );
  if (
    scoreMap.size !== scores.length ||
    scores.some(
      (score) =>
        !context.snapshot.items.some(
          (item) => item.id === score.canonicalItemId
        )
    )
  )
    fail('PLANNER_SCORE', 'scores require unique canonical item ids');
  const candidates = context.snapshot.items
    .map((item) => ({
      canonicalItemId: item.id,
      priority: item.priority ?? 2,
      advisoryScore: scoreMap.get(item.id) ?? 0,
      denial: plannerDenial(context, item.id),
      actionAuthorized: false as const,
    }))
    .sort(
      (a, b) =>
        a.priority - b.priority ||
        b.advisoryScore - a.advisoryScore ||
        (a.canonicalItemId < b.canonicalItemId
          ? -1
          : a.canonicalItemId > b.canonicalItemId
            ? 1
            : 0)
    );
  return {
    identity: context.expected,
    candidates,
    actionAuthorized: false as const,
    liveVerificationPerformed: false as const,
  };
}
