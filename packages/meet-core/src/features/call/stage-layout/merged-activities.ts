import { BOARD_ACTIVITY, toolActivityId } from './activity-ids';

/** The activities Meet UX v2 offers once, in place of several older kinds. */
export type MergedActivityKind = 'whiteboard' | 'timer';

/** The pen board tool and the classroom whiteboard pane. */
export const PEN_WHITEBOARD_ACTIVITY = toolActivityId('pen-whiteboard');
export const CLASSROOM_WHITEBOARD_ACTIVITY = 'whiteboard';
/** The private timer tool and the room timer page of the Activities dialog. */
export const PERSONAL_TIMER_ACTIVITY = toolActivityId('timers');
export const CLASS_TIMER_PAGE = 'class-timer';

/**
 * Every older id of a merged activity, best first: the catalog offers the
 * first one this person may open. The rest stay routable, so a saved layout,
 * a Follow or a Summon from an older client still opens its pane; only its
 * name changes.
 */
export const MERGED_ACTIVITY_IDS: Readonly<
  Record<MergedActivityKind, readonly string[]>
> = {
  whiteboard: [
    BOARD_ACTIVITY,
    PEN_WHITEBOARD_ACTIVITY,
    CLASSROOM_WHITEBOARD_ACTIVITY,
  ],
  timer: [PERSONAL_TIMER_ACTIVITY, CLASS_TIMER_PAGE],
};

/**
 * The whiteboard order while a guest in the room cannot open the Tuturuuu
 * Whiteboard: the pen board everyone can draw on comes first.
 */
export const PEN_FIRST_WHITEBOARD_IDS: readonly string[] = [
  PEN_WHITEBOARD_ACTIVITY,
  CLASSROOM_WHITEBOARD_ACTIVITY,
  BOARD_ACTIVITY,
];

/** The merged kind a stage id or catalog id stands for, if any. */
export function mergedKindOf(id: string | null | undefined) {
  if (!id) return null;
  for (const kind of Object.keys(MERGED_ACTIVITY_IDS) as MergedActivityKind[])
    if (MERGED_ACTIVITY_IDS[kind].includes(id)) return kind;
  return null;
}

/** The catalog id of a merged entry, which also picks its Activities group. */
export const MERGED_TILE_ID: Readonly<Record<MergedActivityKind, string>> = {
  whiteboard: 'whiteboard',
  timer: 'timer',
};
