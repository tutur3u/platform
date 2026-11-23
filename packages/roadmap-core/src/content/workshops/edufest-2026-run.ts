/**
 * EduFest 2026 workshop: the 90-minute run of show and how ready each step
 * is. Text lives in messages/edufest-2026.{en,vi}.json (agenda.items); the
 * curated rehearsal verdicts live in edufest-2026-readiness.ts. The derived
 * status always comes from the roadmap deliverables a step depends on.
 */
import type { WorkshopStatus } from './edufest-2026.ts';

export const RUN_STEPS = [
  's0',
  's1',
  's2',
  's3',
  's4',
  's5',
  's6',
  's7',
] as const;
export type RunStepId = (typeof RUN_STEPS)[number];

export const PRODUCTS = ['upskii', 'meet', 'tasks'] as const;
export type Product = (typeof PRODUCTS)[number];

export type Seat = 'everyone' | 'student' | 'teacher';

/** Who leads a step: the two speakers, or the floor crew at the doors. */
export const LEADS = ['phuc', 'cuong', 'crew'] as const;
export type Lead = (typeof LEADS)[number];

/** The two speakers, by their official names; roles live in the messages. */
export const SPEAKERS = [
  { id: 'phuc', name: 'Võ Hoàng Phúc' },
  { id: 'cuong', name: 'Nguyễn Mạnh Cường' },
] as const satisfies readonly { id: Lead; name: string }[];

export type RunStep = {
  id: RunStepId;
  /** Minutes from the session start (T0); doors open before it. */
  start: number;
  end: number;
  seat: Seat;
  /** First is the lead; on a handover step the lead passes to the second. */
  leads: readonly Lead[];
  products: readonly Product[];
  /** Where the class moves from one product to the next. */
  handover: { from: Product; to: Product } | null;
  /** Roadmap deliverables the step needs; empty when it needs no product. */
  deliverables: readonly string[];
};

const step = (
  id: RunStepId,
  [start, end]: [number, number],
  seat: Seat,
  leads: Lead[],
  products: Product[],
  deliverables: string[],
  handover: RunStep['handover'] = null
): RunStep => ({
  id,
  start,
  end,
  seat,
  leads,
  products,
  handover,
  deliverables,
});

/**
 * The room takes the class as students first (Upskii, then live in Meet),
 * flips to the teacher seat to see how it was built, asks its questions
 * while the meeting is still live, and ends with the follow-up in Tasks.
 */
export const RUN_OF_SHOW: readonly RunStep[] = [
  step('s0', [-20, 0], 'student', ['crew'], ['upskii'], ['shortener-workers']),
  step('s1', [0, 6], 'everyone', ['phuc'], [], []),
  step(
    's2',
    [6, 28],
    'student',
    ['cuong'],
    ['upskii'],
    ['upskii-ai-generators', 'upskii-quiz-sets']
  ),
  step(
    's3',
    [28, 40],
    'teacher',
    ['cuong'],
    ['upskii'],
    ['upskii-teaching-studio', 'upskii-ai-generators', 'upskii-quiz-sets']
  ),
  step(
    's4',
    [40, 45],
    'everyone',
    ['cuong', 'phuc'],
    ['upskii', 'meet'],
    [
      'upskii-account-linking',
      'upskii-integration-card',
      'settings-integrations-section',
      'meet-guest-join',
      'mira-owner-consent',
    ],
    { from: 'upskii', to: 'meet' }
  ),
  step(
    's5',
    [45, 70],
    'student',
    ['phuc', 'cuong'],
    ['meet', 'upskii'],
    [
      'meet-upskii-presenter',
      'meet-follow-me',
      'meet-classroom-quizzes',
      'meet-live-qa',
      'meet-live-transcripts',
    ]
  ),
  step(
    's6',
    [70, 82],
    'everyone',
    ['phuc', 'cuong'],
    ['meet'],
    ['meet-live-qa']
  ),
  step(
    's7',
    [82, 90],
    'teacher',
    ['phuc'],
    ['meet', 'tasks'],
    ['meet-auto-notes', 'meet-action-items-roundtrip'],
    { from: 'meet', to: 'tasks' }
  ),
];

export const SESSION_MINUTES = 90;

const RANK: Record<WorkshopStatus, number> = {
  planned: 0,
  in_progress: 1,
  live: 2,
};

/**
 * A step is only as ready as its least ready deliverable. An unknown
 * deliverable counts as planned; a step without any has no derived status.
 */
export function worstOf(
  ids: readonly string[],
  statuses: ReadonlyMap<string, WorkshopStatus>
): WorkshopStatus | null {
  let worst: WorkshopStatus | null = null;
  for (const id of ids) {
    const status = statuses.get(id) ?? 'planned';
    if (worst === null || RANK[status] < RANK[worst]) worst = status;
  }
  return worst;
}

export const READINESS = ['ready', 'at_risk', 'blocked', 'missing'] as const;
export type Readiness = (typeof READINESS)[number];

export const TEAMS = ['upskii', 'meet', 'platform', 'workshop'] as const;
export type Team = (typeof TEAMS)[number];

/** One curated rehearsal check of a step. Dates are YYYY-MM-DD, Vietnam time. */
export type Verdict = {
  readiness: Readiness;
  checkedAt: string;
  owner: Team;
  nextEta: string | null;
  left: { en: string; vi: string };
};

/** A verdict older than this many days is stale and never reads as ready. */
export const STALE_AFTER_DAYS = 3;

/**
 * What a step shows. A stale verdict keeps its owner and what is left but
 * drops its readiness, so an old "ready" can never stand in for a re-check.
 */
export type StepReadiness =
  | {
      kind: 'checked';
      derived: WorkshopStatus | null;
      verdict: Verdict;
      overdue: boolean;
    }
  | {
      kind: 'stale';
      derived: WorkshopStatus | null;
      verdict: Verdict;
      ageDays: number;
    }
  | { kind: 'unchecked'; derived: WorkshopStatus | null };

const DAY_MS = 86_400_000;
/** Midnight of a YYYY-MM-DD day in Vietnam (UTC+7), as epoch ms. */
export function vietnamDay(isoDate: string): number {
  return Date.parse(`${isoDate}T00:00:00+07:00`);
}

/** Whole Vietnam calendar days from `isoDate` to `now`. */
export function daysSince(isoDate: string, now: number): number {
  return Math.floor((now - vietnamDay(isoDate)) / DAY_MS);
}

export function stepReadiness(
  step: Pick<RunStep, 'deliverables'>,
  verdict: Verdict | undefined,
  statuses: ReadonlyMap<string, WorkshopStatus>,
  now: number
): StepReadiness {
  const derived = worstOf(step.deliverables, statuses);
  if (!verdict) return { kind: 'unchecked', derived };
  const ageDays = daysSince(verdict.checkedAt, now);
  if (ageDays > STALE_AFTER_DAYS)
    return { kind: 'stale', derived, verdict, ageDays };
  const overdue =
    verdict.readiness !== 'ready' &&
    verdict.nextEta !== null &&
    daysSince(verdict.nextEta, now) >= 1;
  return { kind: 'checked', derived, verdict, overdue };
}

/** "8–22" style minutes; the doors step reads as minutes before the start. */
export function minutesLabel(step: Pick<RunStep, 'start' | 'end'>) {
  return step.start < 0
    ? { kind: 'before' as const, minutes: -step.start }
    : { kind: 'range' as const, start: step.start, end: step.end };
}

/** A short date in Vietnam time: "24 Nov" in English, "24/11" in Vietnamese. */
export function shortDate(iso: string, lang: 'en' | 'vi'): string {
  const time = /^\d{4}-\d{2}-\d{2}$/.test(iso)
    ? vietnamDay(iso)
    : Date.parse(iso);
  const local = new Date(time + 7 * 3_600_000);
  const day = local.getUTCDate();
  const month = local.getUTCMonth();
  if (lang === 'vi')
    return `${String(day).padStart(2, '0')}/${String(month + 1).padStart(2, '0')}`;
  const names = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ');
  return `${day} ${names[month]}`;
}
