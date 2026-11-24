'use client';
import type {
  MeetRoomView,
  MeetStageLayoutSnapshot,
} from '@tuturuuu/realtime/meet';
import { useCallback, useEffect, useRef } from 'react';
import {
  FOLLOW_UPDATE_GAP_MS,
  followUpdateDelay,
  type NavigationTargets,
} from '../components/room-navigation-policy';
import type { MeetRoomController } from '../lib/room-controller';

/**
 * Gap before a leader who cannot manage participants invites someone who
 * joined after they started leading; the room paces their starts at 5 s.
 */
export const FOLLOW_INVITE_GAP_MS = 5100;

/** What a leader shares: the surface in focus and the whole arrangement. */
export const shareKey = (viewKey: string, layout?: MeetStageLayoutSnapshot) =>
  layout ? `${viewKey}|${JSON.stringify(layout)}` : viewKey;

/**
 * A leader's view and arrangement reach the people following them. Updates
 * are spaced just above the room's pacing and the latest one always goes out,
 * so nobody is left one change behind. Someone who joins the call (or comes
 * back) while targeted gets a start of their own with the current
 * arrangement, which waits for the room's start pacing before updates resume.
 */
export function useFollowBroadcast({
  request,
  leading,
  canManage,
  otherIds,
  viewKey,
  view,
  layout,
}: {
  request: MeetRoomController['requestNavigation'];
  leading: NavigationTargets | null;
  canManage: boolean;
  otherIds: readonly string[];
  viewKey: string;
  view: MeetRoomView;
  layout?: MeetStageLayoutSnapshot;
}) {
  const key = shareKey(viewKey, layout);
  const latest = useRef({ key, view, layout });
  latest.current = { key, view, layout };
  const leadingRef = useRef(leading);
  leadingRef.current = leading;
  const startGap = canManage ? FOLLOW_UPDATE_GAP_MS : FOLLOW_INVITE_GAP_MS;
  const startGapRef = useRef(startGap);
  startGapRef.current = startGap;
  const requestRef = useRef(request);
  requestRef.current = request;

  const sentKey = useRef<string | null>(null);
  const lastSentAt = useRef(0);
  const known = useRef(new Set<string>());
  const joiners = useRef(new Set<string>());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const targets = leadingRef.current;
    if (!targets) return;
    const now = Date.now();
    const current = latest.current;
    const later = (wait: number) => {
      timer.current = setTimeout(flush, wait);
    };
    if (joiners.current.size) {
      const wait = Math.max(0, lastSentAt.current + startGapRef.current - now);
      if (wait) return later(wait);
      const ids = [...joiners.current].filter((id) => known.current.has(id));
      joiners.current.clear();
      if (ids.length) {
        lastSentAt.current = now;
        requestRef.current({
          mode: 'follow',
          targets: ids,
          view: current.view,
          ...(current.layout ? { layout: current.layout } : {}),
        });
        if (sentKey.current !== current.key) later(FOLLOW_UPDATE_GAP_MS);
        return;
      }
    }
    if (sentKey.current === current.key) return;
    const wait = followUpdateDelay(lastSentAt.current, now);
    if (wait) return later(wait);
    sentKey.current = current.key;
    lastSentAt.current = now;
    requestRef.current({
      mode: 'follow.update',
      targets,
      view: current.view,
      ...(current.layout ? { layout: current.layout } : {}),
    });
  }, []);

  useEffect(() => {
    if (leading) return;
    clearTimeout(timer.current);
    sentKey.current = null;
    joiners.current.clear();
  }, [leading]);

  // A new view or arrangement is what sends; `key` names both.
  useEffect(() => {
    if (leading) flush();
  }, [key, leading, flush]);

  useEffect(() => {
    if (!leading) return;
    const present = new Set(otherIds);
    for (const id of known.current)
      if (!present.has(id)) {
        known.current.delete(id);
        joiners.current.delete(id);
      }
    let added = false;
    for (const id of otherIds) {
      if (known.current.has(id)) continue;
      known.current.add(id);
      if (leading === 'everyone' || leading.includes(id)) {
        joiners.current.add(id);
        added = true;
      }
    }
    if (added) flush();
  }, [otherIds, leading, flush]);

  /** Starts leading: one `follow` with the current view and arrangement. */
  const start = (targets: NavigationTargets) => {
    known.current = new Set(otherIds);
    joiners.current.clear();
    sentKey.current = key;
    lastSentAt.current = Date.now();
    request({
      mode: 'follow',
      targets,
      view,
      ...(layout ? { layout } : {}),
    });
  };
  return { start };
}
