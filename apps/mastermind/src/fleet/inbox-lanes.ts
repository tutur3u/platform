import type {
  FleetDecision,
  FleetResolvedDecision,
  FleetSnapshot,
} from './contract';
import { type InboxItem, inbox, loginRequests } from './model';

const RANK: Record<FleetDecision['urgency'], number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  fyi: 3,
};

export type NeedsItem =
  | ({ kind: 'ask' } & InboxItem)
  | ({ kind: 'review' } & InboxItem)
  | { kind: 'login'; request: ReturnType<typeof loginRequests>[number] };

export interface InboxLanes {
  /** Open asks, reviews and sign-ins, most urgent first. */
  needs: NeedsItem[];
  /** Open FYI asks and decisions closed elsewhere or here. */
  fyi: { asks: InboxItem[]; resolved: FleetResolvedDecision[] };
  /** Answers recorded in the last day, newest first. */
  recent: InboxItem[];
  snoozed: InboxItem[];
}

function deadline(decision: FleetDecision) {
  return decision.deadlineAt
    ? Date.parse(decision.deadlineAt)
    : Number.POSITIVE_INFINITY;
}

/**
 * Splits the Inbox into Needs you and FYI. Urgency ranks first, then the
 * nearest deadline; open sign-ins rank with high asks, since work is
 * blocked on them.
 */
export function inboxLanes(
  snapshot: FleetSnapshot,
  snoozes: Readonly<Record<string, number>>,
  now: number
): InboxLanes {
  const views = inbox(snapshot, snoozes, now);
  const needs: NeedsItem[] = [];
  const fyiAsks: InboxItem[] = [];
  for (const item of views.open) {
    if (item.decision.kind === 'review')
      needs.push({ kind: 'review', ...item });
    else if (item.decision.urgency === 'fyi') fyiAsks.push(item);
    else needs.push({ kind: 'ask', ...item });
  }
  for (const request of loginRequests(snapshot.state, new Date(now)))
    if (request.state === 'waiting' || request.state === 'approved')
      needs.push({ kind: 'login', request });
  const decisionOf = (item: NeedsItem) =>
    item.kind === 'login' ? item.request.decision : item.decision;
  const rank = (item: NeedsItem) =>
    item.kind === 'login' ? RANK.high : RANK[decisionOf(item).urgency];
  needs.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      deadline(decisionOf(a)) - deadline(decisionOf(b)) ||
      decisionOf(a).createdAt.localeCompare(decisionOf(b).createdAt)
  );
  return {
    needs,
    fyi: {
      asks: fyiAsks,
      resolved: [...(snapshot.state.resolved ?? [])]
        .filter((decision) => decision.kind !== 'login')
        .sort((a, b) => b.resolvedAt.localeCompare(a.resolvedAt)),
    },
    recent: [...views.answered].sort((a, b) =>
      (b.receipt?.answeredAt ?? '').localeCompare(a.receipt?.answeredAt ?? '')
    ),
    snoozed: views.snoozed,
  };
}

/** What the sidebar badge counts: everything in Needs you. */
export function needsCount(lanes: InboxLanes) {
  return lanes.needs.length;
}
