'use client';
import type { MeetRoomView } from '@tuturuuu/realtime/meet';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type CallSurfaceState,
  canOpenRoomView,
  currentRoomView,
  decideNavigation,
  followUpdateDelay,
  type NavigationTargets,
  type RoomViewAccess,
  sameRoomView,
  surfaceFromView,
  targetCount,
  unseenNavigation,
} from '../components/room-navigation-policy';
import type { MeetRoomController } from '../lib/room-controller';
import { findMeetTool } from '../tools/registry';

export type { NavigationTargets };

export interface ApplyResult {
  reached?: MeetRoomView;
  back?: () => void;
}

export interface NavigationPerson {
  userId: string;
  displayName: string;
  avatarUrl?: string;
}

const viewKey = (view: MeetRoomView) =>
  view.surface === 'tool' ? `tool:${view.toolId}` : view.surface;
// One toast per sender: a repeated invitation replaces the earlier one.
const summonToast = (userId: string) => `meet-summon:${userId}`;
const followToast = (userId: string) => `meet-follow:${userId}`;
const blockedToast = (userId: string) => `meet-navigation-blocked:${userId}`;

/** Display names for room surfaces, shared by the menus, banner and toasts. */
export function useSurfaceLabel() {
  const t = useTranslations('meet.call.surfaces');
  const all = useTranslations();
  return useCallback(
    (view: MeetRoomView) => {
      if (view.surface !== 'tool') return t(view.surface);
      const label = findMeetTool(view.toolId)?.label ?? view.toolId;
      return all.has(label) ? all(label) : label;
    },
    [t, all]
  );
}

/**
 * Follow and Summon for one person in the call. Outgoing requests go through
 * the room; incoming ones are handled once each, by id. Hosts and co-hosts
 * move people directly (the room marks those events forced); everyone else
 * gets an invitation they can accept or dismiss.
 */
export function useRoomNavigation({
  room,
  surface,
  apply,
  access,
}: {
  room: MeetRoomController;
  surface: CallSurfaceState;
  /**
   * `forced` marks a move a host or co-host made, which opens the surface.
   * It may report the view the person is on afterwards when that is not
   * `next` (a view that opens nothing leaves them where they are), and a
   * `back` that undoes the move.
   */
  apply: (
    next: CallSurfaceState,
    options: { forced: boolean }
  ) => ApplyResult | void;
  access: RoomViewAccess;
}) {
  const t = useTranslations('meet.call');
  const label = useSurfaceLabel();
  const { state } = room;
  const view = currentRoomView(surface);
  const key = viewKey(view);
  const others = useMemo<NavigationPerson[]>(
    () =>
      Object.values(state.participants)
        .filter((person) => person.userId !== state.selfUserId)
        .map((person) => ({
          userId: person.userId,
          displayName: person.displayName,
          avatarUrl: person.avatarUrl,
        })),
    [state.participants, state.selfUserId]
  );
  const otherIds = useMemo(() => others.map((p) => p.userId), [others]);
  const nameOf = useCallback(
    (userId: string) =>
      state.participants[userId]?.displayName ?? t('navigation.someone'),
    [state.participants, t]
  );

  const canManage = !!state.canManageParticipants || state.role === 'host';
  const [leading, setLeading] = useState<NavigationTargets | null>(null);
  // The room paces starts (hosts 1 s, everyone else 5 s); wait it out here.
  const [paused, setPaused] = useState(false);
  const pauseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );
  useEffect(() => () => clearTimeout(pauseTimer.current), []);
  const pace = () => {
    setPaused(true);
    clearTimeout(pauseTimer.current);
    pauseTimer.current = setTimeout(
      () => setPaused(false),
      canManage ? 1000 : 5000
    );
  };
  const [following, setFollowing] = useState<string | null>(null);
  const followingRef = useRef(following);
  followingRef.current = following;
  const appliedKey = useRef<string | null>(null);
  const sentKey = useRef<string | null>(null);
  const seen = useRef(new Set<string>());
  const surfaceRef = useRef(surface);
  surfaceRef.current = surface;
  const applyRef = useRef(apply);
  applyRef.current = apply;
  // Read through a ref so an invitation accepted later is checked against the
  // access the person has at that moment, not when the toast appeared.
  const accessRef = useRef(access);
  accessRef.current = access;
  const canOpen = useCallback(
    (next: MeetRoomView, forced: boolean) =>
      canOpenRoomView(next, accessRef.current, forced),
    []
  );
  // Follow invitations still on screen, with the leader's latest surface.
  const invitations = useRef(
    new Map<string, { view?: MeetRoomView; forced: boolean }>()
  );

  const go = useCallback((next: MeetRoomView, forced: boolean) => {
    const result = applyRef.current(
      surfaceFromView(next, surfaceRef.current.drawer),
      { forced }
    );
    // Following ends when the view I am on stops matching what was applied,
    // so record where applying actually left me.
    appliedKey.current = viewKey(result?.reached ?? next);
    return result?.back;
  }, []);

  const startFollowing = useCallback(
    (leaderId: string, next: MeetRoomView | undefined, forced: boolean) => {
      setFollowing(leaderId);
      followingRef.current = leaderId;
      if (next && canOpen(next, forced)) go(next, forced);
      else appliedKey.current = viewKey(currentRoomView(surfaceRef.current));
    },
    [canOpen, go]
  );

  useEffect(() => {
    for (const event of unseenNavigation(state.navigation, seen.current)) {
      const invited = invitations.current.get(event.from);
      if (invited && event.mode === 'follow.update')
        invitations.current.set(event.from, { ...invited, view: event.view });
      const decision = decideNavigation(event, {
        selfUserId: state.selfUserId,
        following: followingRef.current,
        canOpen,
      });
      const name = nameOf(event.from);
      switch (decision.kind) {
        case 'navigate': {
          const previous = surfaceRef.current;
          setFollowing(null);
          followingRef.current = null;
          const back = go(decision.view, true);
          toast(t('summon.brought', { name, surface: label(decision.view) }), {
            action: {
              label: t('summon.go_back'),
              onClick: () =>
                back ? back() : applyRef.current(previous, { forced: false }),
            },
          });
          break;
        }
        case 'invite': {
          const blocked = t('summon.blocked', {
            name,
            surface: label(decision.view),
          });
          toast(t('summon.invite', { name, surface: label(decision.view) }), {
            id: summonToast(event.from),
            duration: 15_000,
            action: {
              label: t('summon.join'),
              onClick: () =>
                canOpen(decision.view, false)
                  ? go(decision.view, false)
                  : void toast(blocked, { id: blockedToast(event.from) }),
            },
            cancel: { label: t('navigation.not_now'), onClick: () => {} },
          });
          break;
        }
        case 'blocked':
          toast(t('summon.blocked', { name, surface: label(decision.view) }), {
            id: blockedToast(event.from),
          });
          break;
        case 'follow-start':
          startFollowing(decision.leaderId, decision.view, true);
          toast(t('follow.started', { name }));
          break;
        case 'follow-invite': {
          const leaderId = decision.leaderId;
          invitations.current.set(leaderId, {
            view: decision.view,
            forced: event.forced,
          });
          const forget = () => invitations.current.delete(leaderId);
          toast(t('follow.ask', { name }), {
            id: followToast(leaderId),
            duration: 15_000,
            onDismiss: forget,
            onAutoClose: forget,
            action: {
              label: t('follow.accept'),
              onClick: () => {
                // The leader may have moved since asking; follow them there.
                const latest = invitations.current.get(leaderId);
                forget();
                startFollowing(
                  leaderId,
                  latest?.view ?? decision.view,
                  latest?.forced ?? false
                );
              },
            },
            cancel: { label: t('navigation.not_now'), onClick: forget },
          });
          break;
        }
        case 'follow-apply':
          go(decision.view, event.forced);
          break;
        case 'follow-end':
          setFollowing(null);
          followingRef.current = null;
          toast(t('follow.ended_by_leader', { name }));
          break;
        case 'follow-withdrawn':
          invitations.current.delete(decision.leaderId);
          toast.dismiss(followToast(decision.leaderId));
          break;
      }
    }
  }, [
    state.navigation,
    state.selfUserId,
    canOpen,
    go,
    label,
    nameOf,
    startFollowing,
    t,
  ]);

  // The room refuses bursts and empty target sets; say so quietly once.
  const lastError = useRef<string | null>(null);
  useEffect(() => {
    const error = state.error;
    if (error === lastError.current) return;
    lastError.current = error;
    if (error === 'navigation_rate_limited')
      toast(t('navigation.rate_limited'));
    else if (error === 'navigation_no_targets')
      toast(t('navigation.no_targets'));
  }, [state.error, t]);

  // An invitation from someone who left the call is withdrawn with them.
  useEffect(() => {
    for (const leaderId of invitations.current.keys())
      if (!state.participants[leaderId]) {
        invitations.current.delete(leaderId);
        toast.dismiss(followToast(leaderId));
      }
  }, [state.participants]);

  // Moving on my own, or the leader leaving the call, ends following.
  useEffect(() => {
    if (!following) return;
    if (!state.participants[following]) {
      setFollowing(null);
      return;
    }
    if (appliedKey.current !== null && appliedKey.current !== key) {
      setFollowing(null);
      toast(t('follow.ended_manual', { name: nameOf(following) }));
    }
  }, [following, key, nameOf, state.participants, t]);

  // Losing permission mid-session ends leading; the room would refuse updates.
  const allowed = canManage || state.settings.participantNavigation !== false;
  useEffect(() => {
    if (!allowed) setLeading(null);
  }, [allowed]);

  // A leader's moves reach the people following them. Updates are spaced, and
  // the last surface always goes out, so nobody is left one switch behind.
  const lastSentAt = useRef(0);
  const updateTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );
  const latest = useRef({ key, view });
  latest.current = { key, view };
  const request = room.requestNavigation;
  useEffect(() => () => clearTimeout(updateTimer.current), []);
  useEffect(() => {
    clearTimeout(updateTimer.current);
    if (!leading) {
      sentKey.current = null;
      return;
    }
    if (sentKey.current === null) sentKey.current = key;
    if (sentKey.current === key) return;
    const send = () => {
      const current = latest.current;
      if (sentKey.current === current.key) return;
      sentKey.current = current.key;
      lastSentAt.current = Date.now();
      request({ mode: 'follow.update', targets: leading, view: current.view });
    };
    const wait = followUpdateDelay(lastSentAt.current, Date.now());
    if (wait) updateTimer.current = setTimeout(send, wait);
    else send();
  }, [key, leading, request]);

  const reached = (targets: NavigationTargets) =>
    targetCount(targets, otherIds);
  return {
    view,
    surfaceName: label(view),
    onStage: view.surface === 'stage',
    others,
    canManage,
    /** Off when the room limits Follow and Summon to hosts and co-hosts. */
    allowed,
    paused,
    leading: leading ? { targets: leading, count: reached(leading) } : null,
    startLeading: (targets: NavigationTargets) => {
      if (!reached(targets) || paused) return;
      setLeading(targets);
      sentKey.current = key;
      lastSentAt.current = Date.now();
      room.requestNavigation({ mode: 'follow', targets, view });
      pace();
    },
    stopLeading: () => {
      if (leading)
        room.requestNavigation({ mode: 'follow.stop', targets: leading });
      setLeading(null);
    },
    summon: (targets: NavigationTargets) => {
      const count = reached(targets);
      if (!count || paused) return;
      room.requestNavigation({ mode: 'summon', targets, view });
      pace();
      toast.success(t(canManage ? 'summon.moved' : 'summon.sent', { count }));
    },
    following: following
      ? { leaderId: following, name: nameOf(following) }
      : null,
    stopFollowing: () => setFollowing(null),
    sameView: (other: MeetRoomView) => sameRoomView(view, other),
  };
}

export type RoomNavigation = ReturnType<typeof useRoomNavigation>;
