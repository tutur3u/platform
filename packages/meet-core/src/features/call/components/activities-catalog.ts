/** The Activities dialog's overview page. */
export const ALL_ACTIVITIES_TAB = 'all';

export const ACTIVITY_GROUPS = [
  'engage',
  'learn',
  'create',
  'run',
  'other',
] as const;
export type ActivityGroup = (typeof ACTIVITY_GROUPS)[number];

/**
 * Sidebar group of each known activity id. An id missing here, such as a
 * newly registered tool, lands in `other` so it is never hidden.
 */
const GROUP_OF: Readonly<Record<string, ActivityGroup>> = {
  'live-qa': 'engage',
  polls: 'engage',
  quiz: 'engage',
  'quiz-arena': 'engage',
  'live-icebreaker': 'engage',
  forms: 'engage',
  'live-flashcards': 'learn',
  'live-game': 'learn',
  'live-assessment': 'learn',
  'pen-whiteboard': 'create',
  whiteboard: 'create',
  programming: 'create',
  document: 'create',
  board: 'create',
  'class-timer': 'run',
  timers: 'other',
  breakouts: 'run',
  'room-activities': 'run',
};

export function activityGroup(id: string): ActivityGroup {
  return GROUP_OF[id] ?? 'other';
}

/**
 * Activities in sidebar order: groups in `ACTIVITY_GROUPS` order, entries in
 * their given order within a group, and empty groups left out.
 */
export function groupActivities<T extends { id: string }>(
  items: readonly T[]
): { group: ActivityGroup; items: T[] }[] {
  return ACTIVITY_GROUPS.map((group) => ({
    group,
    items: items.filter((item) => activityGroup(item.id) === group),
  })).filter((entry) => entry.items.length > 0);
}
