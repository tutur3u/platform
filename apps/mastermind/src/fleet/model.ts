import {
  effectiveLoginState,
  type FleetAnswerReceipt,
  type FleetDecision,
  type FleetResolvedDecision,
  type FleetSnapshot,
  type FleetState,
} from './contract';

/** A snapshot older than this, or an offline orchestrator, reads as stale. */
export const FLEET_STALE_AFTER_MS = 120_000;

export type Freshness = 'live' | 'old' | 'orchestratorOffline';

export function freshness(state: FleetState, now: number): Freshness {
  if (now - Date.parse(state.generatedAt) > FLEET_STALE_AFTER_MS) return 'old';
  return state.orchestrator.state === 'offline'
    ? 'orchestratorOffline'
    : 'live';
}

export type InboxTier = 'urgent' | 'decide' | 'fyi';

export function tierOf(decision: FleetDecision): InboxTier {
  if (decision.urgency === 'urgent') return 'urgent';
  return decision.urgency === 'fyi' ? 'fyi' : 'decide';
}

function byDeadline(a: FleetDecision, b: FleetDecision) {
  const da = a.deadlineAt ? Date.parse(a.deadlineAt) : Number.POSITIVE_INFINITY;
  const db = b.deadlineAt ? Date.parse(b.deadlineAt) : Number.POSITIVE_INFINITY;
  return da - db || Date.parse(a.createdAt) - Date.parse(b.createdAt);
}

export type InboxView = 'open' | 'snoozed' | 'answered';

export interface InboxItem {
  decision: FleetDecision;
  receipt?: FleetAnswerReceipt;
  snoozedUntil?: number;
}

/**
 * Splits open asks (never login requests) by view: answered = an answer is
 * recorded and awaits or has had pickup; snoozed = hidden on this device
 * until its time; open = everything else, most urgent first.
 */
export function inbox(
  snapshot: FleetSnapshot,
  snoozes: Readonly<Record<string, number>>,
  now: number
): Record<InboxView, InboxItem[]> {
  const views: Record<InboxView, InboxItem[]> = {
    open: [],
    snoozed: [],
    answered: [],
  };
  const asks = snapshot.state.decisions
    .filter((decision) => decision.kind !== 'login')
    .sort(byDeadline);
  for (const decision of asks) {
    const receipt = snapshot.answers[decision.id];
    const until = snoozes[decision.id];
    if (receipt) views.answered.push({ decision, receipt });
    else if (until && until > now)
      views.snoozed.push({ decision, snoozedUntil: until });
    else views.open.push({ decision });
  }
  return views;
}

export function loginRequests(state: FleetState, now: Date) {
  return state.decisions
    .filter((decision) => decision.kind === 'login' && decision.login)
    .map((decision) => ({
      decision,
      // Narrowed by the filter; the contract pairs kind and payload.
      login: decision.login as NonNullable<FleetDecision['login']>,
      state: effectiveLoginState(
        decision.login as NonNullable<FleetDecision['login']>,
        now
      ),
    }))
    .sort((a, b) => byDeadline(a.decision, b.decision));
}

export interface Digest {
  running: number;
  machinesOnline: number;
  machines: number;
  needYou: number;
  logins: { service: string; machine?: string }[];
}

export function digest(
  snapshot: FleetSnapshot,
  snoozes: Readonly<Record<string, number>>,
  now: number
): Digest {
  const { state } = snapshot;
  const views = inbox(snapshot, snoozes, now);
  const label = (id?: string) =>
    state.machines.find((machine) => machine.id === id)?.label ?? id;
  return {
    running: state.counts.running,
    machinesOnline: state.machines.filter((m) => m.status === 'online').length,
    machines: state.machines.length,
    needYou: views.open.filter((item) => tierOf(item.decision) !== 'fyi')
      .length,
    logins: loginRequests(state, new Date(now))
      .filter((item) => item.state === 'waiting' || item.state === 'approved')
      .map((item) => ({
        service: item.login.service,
        machine: label(item.login.machineId),
      })),
  };
}

export type ActivityTone = 'green' | 'orange' | 'red' | 'blue' | 'gray';
export type ActivityEvent =
  | { kind: 'asked'; at: string; title: string; tone: ActivityTone }
  | {
      kind: 'resolved';
      at: string;
      title: string;
      via?: FleetResolvedDecision['answeredVia'];
      tone: ActivityTone;
    }
  | {
      kind: 'lane';
      at: string;
      title: string;
      state: string;
      tone: ActivityTone;
    }
  | { kind: 'incident'; at: string; title: string; tone: ActivityTone }
  | { kind: 'deployed'; at: string; sha?: string; tone: ActivityTone };

const LANE_TONE: Record<string, ActivityTone> = {
  failed: 'red',
  waiting: 'orange',
  running: 'green',
};

/** A timeline built only from timestamps the snapshot already carries. */
export function activity(state: FleetState, limit = 20): ActivityEvent[] {
  const events: ActivityEvent[] = [
    ...state.decisions.map((d) => ({
      kind: 'asked' as const,
      at: d.createdAt,
      title: d.title,
      tone: d.kind === 'login' ? ('orange' as const) : ('blue' as const),
    })),
    ...(state.resolved ?? []).map((d) => ({
      kind: 'resolved' as const,
      at: d.resolvedAt,
      title: d.title,
      via: d.answeredVia,
      tone: 'green' as const,
    })),
    ...state.lanes
      .filter((lane) => lane.state === 'failed' || lane.state === 'waiting')
      .map((lane) => ({
        kind: 'lane' as const,
        at: lane.updatedAt,
        title: lane.title,
        state: lane.state,
        tone: LANE_TONE[lane.state] ?? 'gray',
      })),
    ...(state.release?.incidents ?? []).map((incident) => ({
      kind: 'incident' as const,
      at: incident.openedAt,
      title: incident.title,
      tone: 'red' as const,
    })),
    ...(state.release?.production?.deployedAt
      ? [
          {
            kind: 'deployed' as const,
            at: state.release.production.deployedAt,
            sha: state.release.production.sha,
            tone: 'green' as const,
          },
        ]
      : []),
  ];
  return events
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, limit);
}

export interface ApprovalRow {
  id: string;
  at: string;
  title: string;
  /** The chosen option's label, or else the bare action. */
  answer?: string;
  action?: FleetAnswerReceipt['action'];
  via?: FleetResolvedDecision['answeredVia'];
  revision?: number;
  pickedUp?: boolean;
}

/** Recorded answers on open decisions plus recently resolved decisions. */
export function approvals(snapshot: FleetSnapshot): ApprovalRow[] {
  const { state, answers } = snapshot;
  const open = state.decisions.flatMap((decision) => {
    const receipt = answers[decision.id];
    if (!receipt) return [];
    const option = decision.options.find((o) => o.id === receipt.optionId);
    return [
      {
        id: `${decision.id}:r${receipt.revision}`,
        at: receipt.answeredAt,
        title: decision.title,
        answer: option?.label,
        action: option ? undefined : receipt.action,
        revision: receipt.revision,
        pickedUp: receipt.pickedUp,
      },
    ];
  });
  const resolved = (state.resolved ?? []).map((decision) => ({
    id: `${decision.id}:resolved`,
    at: decision.resolvedAt,
    title: decision.title,
    answer: decision.outcome,
    via: decision.answeredVia,
  }));
  return [...open, ...resolved].sort(
    (a, b) => Date.parse(b.at) - Date.parse(a.at)
  );
}

/** `1:05:09`, `4:07`, or `0:00` once passed. */
export function formatRemaining(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}
