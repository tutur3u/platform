/**
 * EduFest 2026 workshop page structure. Text lives in
 * messages/edufest-2026.{en,vi}.json; this file holds only ids, roles and
 * the roadmap deliverable each capability shows. Statuses are always
 * derived from those deliverables, never written here.
 */
import type { Status } from '../../live/status';

/**
 * Confirmed by the USER on 11 Nov 2026: Saturday 5 December 2026 at RMIT
 * University Vietnam, Saigon South campus. Display text is in the messages;
 * null here renders "to be announced".
 */
export const WORKSHOP_EVENT: {
  isoDate: string | null;
  mapQuery: string | null;
} = {
  isoDate: '2026-12-05',
  mapQuery:
    'RMIT University Vietnam, 702 Nguyen Van Linh, Tan Phong, District 7, Ho Chi Minh City',
};

/** Google Maps search link for the venue, or null while it is unknown. */
export function mapHref(query: string | null): string | null {
  return query
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
    : null;
}

/** An all-day iCalendar event for the workshop date. */
export function buildIcs({
  isoDate,
  title,
  location,
  url,
}: {
  isoDate: string;
  title: string;
  location: string;
  url: string;
}): string {
  const day = isoDate.replaceAll('-', '');
  const next = new Date(`${isoDate}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const end = next.toISOString().slice(0, 10).replaceAll('-', '');
  // RFC 5545 text: escape backslash, semicolon and comma; CRLF line ends.
  const text = (value: string) => value.replace(/[\\;,]/g, (c) => `\\${c}`);
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Tuturuuu//EduFest 2026 workshop//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:edufest-2026-workshop-${day}@tuturuuu.com`,
    `DTSTAMP:${day}T000000Z`,
    `DTSTART;VALUE=DATE:${day}`,
    `DTEND;VALUE=DATE:${end}`,
    `SUMMARY:${text(title)}`,
    `LOCATION:${text(location)}`,
    `URL:${url}`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

export const WORKSHOP_PATH = '/roadmap/workshops/edufest-2026';
export const WORKSHOP_URL = `https://tuturuuu.com${WORKSHOP_PATH}`;

export type WorkshopStatus = 'live' | 'in_progress' | 'planned';

/** Collapse the roadmap's five stages to the three labels the page shows. */
export function toWorkshopStatus(status: Status): WorkshopStatus {
  if (status === 'live') return 'live';
  if (status === 'planned') return 'planned';
  return 'in_progress';
}

export const ROLES = ['student', 'teacher', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export const TOOLS = [
  'meet',
  'upskii',
  'learn',
  'tasks',
  'calendar',
  'notes',
  'mira',
  'ai-studio',
  'chat',
  'drive',
  'forms',
  'mail',
  'track',
  'colab',
  'tulletin',
] as const;
export type ToolId = (typeof TOOLS)[number];

export const CAPABILITIES = [
  'live',
  'support',
  'assess',
  'prepare',
  'organise',
  'govern',
] as const;
export type Capability = (typeof CAPABILITIES)[number];

export type UseCase = {
  id: string;
  capability: Capability;
  /** The tool that provides it, shown as a small tag. */
  tool: ToolId;
  roles: readonly Role[];
  /** Roadmap deliverable whose derived status this capability shows. */
  deliverable: string;
};

const uc = (
  id: string,
  capability: Capability,
  tool: ToolId,
  roles: Role[],
  deliverable: string
): UseCase => ({ id, capability, tool, roles, deliverable });

/** Classroom capabilities, current and upcoming, each tied to one deliverable. */
export const USE_CASES: readonly UseCase[] = [
  uc('class-size', 'live', 'meet', ['teacher', 'admin'], 'meet-classroom-caps'),
  uc('co-teach', 'live', 'meet', ['teacher'], 'meet-classroom-roles'),
  uc('share', 'live', 'meet', ['teacher', 'student'], 'meet-classroom-share'),
  uc(
    'captions',
    'live',
    'meet',
    ['student', 'teacher'],
    'meet-classroom-captions'
  ),
  uc(
    'transcripts',
    'live',
    'meet',
    ['student', 'teacher'],
    'meet-live-transcripts'
  ),
  uc('co-code', 'live', 'meet', ['student', 'teacher'], 'meet-workbench'),
  uc(
    'ai-levels',
    'support',
    'meet',
    ['teacher', 'student'],
    'meet-classroom-ai-levels'
  ),
  uc('handwriting', 'support', 'meet', ['student'], 'meet-classroom-drawing'),
  uc('mira-screen', 'support', 'mira', ['student', 'teacher'], 'mira-open-app'),
  uc('mira-voice', 'support', 'mira', ['student'], 'mira-voice-assistant'),
  uc(
    'chat-files',
    'support',
    'chat',
    ['student', 'teacher'],
    'chat-file-uploads'
  ),
  uc('coding-lab', 'support', 'learn', ['student'], 'learn-coding-lab'),
  uc('team-ai', 'support', 'colab', ['student'], 'colab-team-ai'),
  uc(
    'quiz',
    'assess',
    'meet',
    ['teacher', 'student'],
    'meet-classroom-quizzes'
  ),
  uc(
    'points',
    'assess',
    'meet',
    ['student', 'teacher'],
    'meet-classroom-points'
  ),
  uc('quiz-sets', 'assess', 'upskii', ['teacher'], 'upskii-quiz-sets'),
  uc(
    'certificates',
    'assess',
    'upskii',
    ['student'],
    'upskii-courses-certificates'
  ),
  uc('one-question', 'assess', 'forms', ['student'], 'forms-one-question'),
  uc('surveys', 'assess', 'forms', ['teacher'], 'forms-three-pane-studio'),
  uc('generators', 'prepare', 'upskii', ['teacher'], 'upskii-ai-generators'),
  uc(
    'teaching-studio',
    'prepare',
    'upskii',
    ['teacher'],
    'upskii-teaching-studio'
  ),
  uc('problem-bank', 'prepare', 'learn', ['teacher'], 'learn-problem-catalog'),
  uc('family-mail', 'prepare', 'mail', ['teacher'], 'mail-ai-drafting'),
  uc(
    'team-workshops',
    'prepare',
    'colab',
    ['student', 'teacher'],
    'colab-workshop-redesign'
  ),
  uc(
    'notebooks',
    'organise',
    'meet',
    ['student', 'teacher'],
    'meet-classroom-notebooks'
  ),
  uc('homework', 'organise', 'tasks', ['student'], 'tasks-new-my-tasks'),
  uc('projects', 'organise', 'tasks', ['teacher', 'student'], 'board-sprints'),
  uc(
    'study-time',
    'organise',
    'calendar',
    ['student'],
    'calendar-smart-scheduler'
  ),
  uc(
    'class-invites',
    'organise',
    'calendar',
    ['teacher', 'admin'],
    'calendar-group-invites'
  ),
  uc(
    'find-time',
    'organise',
    'meet',
    ['teacher', 'admin'],
    'meet-together-plans'
  ),
  uc('notes', 'organise', 'notes', ['student', 'teacher'], 'workspace-notes'),
  uc('note-links', 'organise', 'notes', ['student', 'teacher'], 'notes-links'),
  uc(
    'mira-home',
    'organise',
    'mira',
    ['student', 'teacher', 'admin'],
    'mira-dashboard'
  ),
  uc('focus', 'organise', 'track', ['student'], 'track-pomodoro-focus'),
  uc(
    'class-storage',
    'organise',
    'drive',
    ['teacher', 'admin'],
    'drive-group-storage'
  ),
  uc('expiring-links', 'organise', 'drive', ['teacher'], 'drive-export-links'),
  uc(
    'integrity',
    'govern',
    'meet',
    ['teacher', 'admin'],
    'meet-classroom-integrity'
  ),
  uc('ai-policy', 'govern', 'mira', ['admin'], 'mira-workspace-policy'),
  uc('ai-log', 'govern', 'ai-studio', ['admin'], 'ai-executions-log'),
  uc('byo-key', 'govern', 'ai-studio', ['admin', 'teacher'], 'ai-own-api-key'),
  uc(
    'byo-chatgpt',
    'govern',
    'ai-studio',
    ['teacher'],
    'ai-chatgpt-subscriptions'
  ),
  uc('edu-admin', 'govern', 'upskii', ['admin'], 'upskii-education-module'),
  uc(
    'marketplace',
    'prepare',
    'upskii',
    ['teacher', 'student'],
    'upskii-course-marketplace'
  ),
  uc('instant-rooms', 'live', 'meet', ['teacher'], 'meet-instant-rooms'),
  uc(
    'recorded-transcripts',
    'live',
    'meet',
    ['student', 'teacher'],
    'meet-recording-transcripts'
  ),
  uc(
    'quick-notes',
    'organise',
    'tulletin',
    ['student', 'teacher'],
    'tulletin-quick-notes'
  ),
  uc(
    'multi-calendar',
    'organise',
    'calendar',
    ['teacher'],
    'calendar-multi-account'
  ),
  uc(
    'offline-files',
    'organise',
    'drive',
    ['student', 'teacher'],
    'drive-offline-list'
  ),
  uc('offline-chat', 'support', 'mira', ['student'], 'mira-offline'),
  uc(
    'on-device',
    'govern',
    'mira',
    ['student', 'teacher', 'admin'],
    'mira-local-models'
  ),
  uc('ai-spend', 'govern', 'ai-studio', ['admin'], 'ai-provider-expenses'),
];

/** Role-play journey: each step lists the capabilities it relies on. */
export const JOURNEY: readonly { id: string; uses: readonly string[] }[] = [
  { id: 'arrive', uses: ['class-size', 'co-teach'] },
  { id: 'learn', uses: ['share', 'captions', 'transcripts'] },
  { id: 'stuck', uses: ['ai-levels', 'mira-screen'] },
  { id: 'upskii', uses: ['generators', 'quiz-sets'] },
  { id: 'practise', uses: ['handwriting', 'co-code', 'notebooks'] },
  { id: 'check', uses: ['quiz', 'points'] },
  { id: 'switch', uses: ['captions', 'integrity', 'ai-log'] },
];
/** From this step on, the participant is back in the teacher's seat. */
export const TEACHER_SEAT_FROM = 'switch';

export const CLASSROOM_FLOW: readonly {
  id: string;
  uses: readonly string[];
}[] = [
  { id: 'before', uses: ['generators', 'class-invites', 'homework'] },
  { id: 'during', uses: ['share', 'ai-levels', 'quiz', 'co-code'] },
  { id: 'after', uses: ['notebooks', 'captions', 'surveys', 'family-mail'] },
];

export const AGENDA = [
  'roles',
  'lesson',
  'upskii',
  'practice',
  'debrief',
] as const;
export const OUTCOMES = ['feel', 'when', 'plan', 'look'] as const;
export const AI_LEVELS = ['off', 'hints', 'full'] as const;
export type AiLevel = (typeof AI_LEVELS)[number];
/** The deliverable behind the AI-help demo. */
export const AI_LEVELS_DELIVERABLE = 'meet-classroom-ai-levels';
/**
 * The only journey steps whose screen changes with the AI help level. The
 * level control is shown on these steps alone: no control without an effect.
 */
export const AI_LEVEL_STEPS = ['stuck', 'practise', 'check'] as const;
export type AiLevelStep = (typeof AI_LEVEL_STEPS)[number];
export function isAiLevelStep(id: string): id is AiLevelStep {
  return (AI_LEVEL_STEPS as readonly string[]).includes(id);
}

/** Marketing highlights, before the agenda. */
export const HIGHLIGHTS = ['seat', 'agents', 'early', 'plan'] as const;

/** "What you'll experience" cards; each names the seat it happens in. */
export const EXPERIENCES: readonly {
  id: string;
  seat: 'student' | 'teacher';
}[] = [
  { id: 'hint', seat: 'student' },
  { id: 'handwriting', seat: 'student' },
  { id: 'quiz', seat: 'student' },
  { id: 'build', seat: 'teacher' },
  { id: 'insights', seat: 'teacher' },
  { id: 'control', seat: 'teacher' },
];

export const FAQ = [
  'who',
  'skills',
  'ready',
  'answers',
  'registration',
  'after',
] as const;

/**
 * Sample data for the classroom-insights mock. Invented for illustration and
 * labelled "demo data" on the page; it is never presented as a measurement.
 */
export const INSIGHTS_DEMO = {
  learners: 40,
  joined: 38,
  questionsToAi: 126,
  averageQuiz: 7.6,
  participation: [92, 88, 85, 81, 77, 74, 70, 64, 58, 49],
  aiHelp: { hints: 64, full: 14, none: 22 },
  quizBuckets: [
    { range: '0–2', learners: 2 },
    { range: '3–5', learners: 7 },
    { range: '6–8', learners: 17 },
    { range: '9–10', learners: 12 },
  ],
  stickingPoints: ['step2', 'units', 'checking'],
} as const;

/** The deliverable behind real class insights (planned). */
export const INSIGHTS_DELIVERABLE = 'meet-classroom-captions';
