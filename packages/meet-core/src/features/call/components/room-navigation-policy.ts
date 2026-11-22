import type { MeetNavigationMode, MeetRoomView } from '@tuturuuu/realtime/meet';

/** What the call shows this person right now, as call-shell tracks it. */
export interface CallSurfaceState {
  programming: boolean;
  document: boolean;
  drawer: string | null;
}

export interface NavigationEvent {
  id: string;
  mode: MeetNavigationMode;
  from: string;
  view?: MeetRoomView;
  forced: boolean;
}

export type NavigationTargets = 'everyone' | string[];

/** The surface a leader would bring people to: collaboration first, then a tool panel. */
export function currentRoomView(surface: CallSurfaceState): MeetRoomView {
  if (surface.programming) return { surface: 'programming' };
  if (surface.document) return { surface: 'document' };
  const toolId = surface.drawer?.startsWith('tool:')
    ? surface.drawer.slice('tool:'.length)
    : null;
  return toolId ? { surface: 'tool', toolId } : { surface: 'stage' };
}

export function sameRoomView(a: MeetRoomView, b: MeetRoomView) {
  if (a.surface !== b.surface) return false;
  return (
    a.surface !== 'tool' || (b.surface === 'tool' && a.toolId === b.toolId)
  );
}

/** Drawers that are not surfaces (chat, people, notes) survive navigation. */
export function surfaceFromView(
  view: MeetRoomView,
  drawer: string | null
): CallSurfaceState {
  const keepDrawer = drawer?.startsWith('tool:') ? null : drawer;
  switch (view.surface) {
    case 'programming':
      return { programming: true, document: false, drawer: keepDrawer };
    case 'document':
      return { programming: false, document: true, drawer: keepDrawer };
    case 'tool':
      return {
        programming: false,
        document: false,
        drawer: `tool:${view.toolId}`,
      };
    default:
      return { programming: false, document: false, drawer: keepDrawer };
  }
}

/**
 * Collaboration surfaces follow the room's activity policy; tool panels and
 * the stage are open to every admitted participant.
 */
export function canOpenRoomView(
  view: MeetRoomView,
  access: { collaboration: boolean; tools: boolean }
) {
  if (view.surface === 'programming' || view.surface === 'document')
    return access.collaboration;
  if (view.surface === 'tool') return access.tools;
  return true;
}

export type NavigationDecision =
  | { kind: 'ignore' }
  | { kind: 'navigate'; view: MeetRoomView }
  | { kind: 'invite'; view: MeetRoomView }
  | { kind: 'blocked'; view: MeetRoomView }
  | { kind: 'follow-start'; leaderId: string; view?: MeetRoomView }
  | { kind: 'follow-invite'; leaderId: string; view?: MeetRoomView }
  | { kind: 'follow-apply'; view: MeetRoomView }
  | { kind: 'follow-end'; leaderId: string }
  | { kind: 'follow-withdrawn'; leaderId: string };

/** Gap between a leader's follow updates; just above the room's own pacing. */
export const FOLLOW_UPDATE_GAP_MS = 300;

/**
 * When the next follow update may go out. A leader who switches twice in a row
 * still ends with followers on the last surface: the second switch waits for
 * the gap instead of being dropped by the room.
 */
export function followUpdateDelay(lastSentAt: number, now: number) {
  return Math.max(0, lastSentAt + FOLLOW_UPDATE_GAP_MS - now);
}

/**
 * One incoming navigation event, decided against what this person is doing.
 * Forced events come from hosts and co-hosts; everyone else needs consent.
 */
export function decideNavigation(
  event: NavigationEvent,
  context: {
    selfUserId: string | null;
    following: string | null;
    canOpen: (view: MeetRoomView) => boolean;
  }
): NavigationDecision {
  if (event.from === context.selfUserId) return { kind: 'ignore' };
  switch (event.mode) {
    case 'summon':
      if (!event.view) return { kind: 'ignore' };
      if (!context.canOpen(event.view))
        return { kind: 'blocked', view: event.view };
      return event.forced
        ? { kind: 'navigate', view: event.view }
        : { kind: 'invite', view: event.view };
    case 'follow':
      if (context.following === event.from) return { kind: 'ignore' };
      return event.forced
        ? { kind: 'follow-start', leaderId: event.from, view: event.view }
        : { kind: 'follow-invite', leaderId: event.from, view: event.view };
    case 'follow.update':
      if (context.following !== event.from || !event.view)
        return { kind: 'ignore' };
      return context.canOpen(event.view)
        ? { kind: 'follow-apply', view: event.view }
        : { kind: 'ignore' };
    case 'follow.stop':
      // Not following yet: the leader withdrew an invitation still on screen.
      return context.following === event.from
        ? { kind: 'follow-end', leaderId: event.from }
        : { kind: 'follow-withdrawn', leaderId: event.from };
    default:
      return { kind: 'ignore' };
  }
}

/** Events not yet handled, oldest first; ids already seen are skipped. */
export function unseenNavigation<T extends { id: string }>(
  events: readonly T[] | undefined,
  seen: Set<string>
) {
  const fresh: T[] = [];
  for (const event of events ?? []) {
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    fresh.push(event);
  }
  return fresh;
}

/** Everyone resolves against the people present now, never a stale list. */
export function targetCount(
  targets: NavigationTargets,
  otherUserIds: readonly string[]
) {
  if (targets === 'everyone') return otherUserIds.length;
  return targets.filter((id) => otherUserIds.includes(id)).length;
}
