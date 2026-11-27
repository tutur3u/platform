'use client';
import type {
  MeetRoomView,
  MeetStageLayoutSnapshot,
} from '@tuturuuu/realtime/meet';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type CallSurfaceState,
  canOpenRoomView,
  currentRoomView,
  decideNavigation,
  type NavigationTargets,
  type RoomViewAccess,
  sameRoomView,
  surfaceFromView,
  targetCount,
  unseenNavigation,
} from '../components/room-navigation-policy';
import type { MeetRoomController } from '../lib/room-controller';
import { findMeetTool } from '../tools/registry';
import { useFollowBroadcast } from './use-follow-broadcast';

export type { NavigationTargets };

export interface ApplyResult {
  reached?: MeetRoomView;
  back?: () => void;
}

interface NavigationSource {
  id: string;
  leader: string;
  kind: 'summon' | 'follow';
}

interface ApplyOptions {
  forced: boolean;
  layout?: MeetStageLayoutSnapshot;
  /** Absent when restoring the previous surface through Go back. */
  source?: NavigationSource;
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
  layout,
  apply,
  onCloseActivity,
  access,
}: {
  room: MeetRoomController;
  surface: CallSurfaceState;
  /** The stage arrangement mirrored by this person's followers. */
  layout?: MeetStageLayoutSnapshot;
  /**
   * `forced` marks a move a host or co-host made, which opens the surface.
   * It may report the view the person is on afterwards when that is not
   * `next` (a view that opens nothing leaves them where they are), and a
   * `back` that undoes the move. `layout` is the leader's arrangement when
   * the move comes from someone this person follows.
   */
  apply: (next: CallSurfaceState, options: ApplyOptions) => ApplyResult | void;
  /**
   * Called when a host closes a specific activity for everyone in the room.
   * Return `false` if the activity was not open locally, to suppress the toast.
   */
  onCloseActivity?: (view: MeetRoomView) => boolean | void;
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
  const seen = useRef(new Set<string>());
  const surfaceRef = useRef(surface);
  surfaceRef.current = surface;
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const onCloseActivityRef = useRef(onCloseActivity);
  onCloseActivityRef.current = onCloseActivity;
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
    new Map<
      string,
      { view?: MeetRoomView; layout?: MeetStageLayoutSnapshot; forced: boolean }
    >()
  );

  const go = useCallback((next: MeetRoomView, options: ApplyOptions) => {
    const result = applyRef.current(
      surfaceFromView(next, surfaceRef.current.drawer),
      options
    );
    return result?.back;
  }, []);

  const startFollowing = useCallback(
    (
      leaderId: string,
      next: MeetRoomView | undefined,
      options: ApplyOptions
    ) => {
      const { forced, layout } = options;
      setFollowing(leaderId);
      followingRef.current = leaderId;
      // An arrangement is mirrored even when its focused surface is one this
      // person may not open; the mirror leaves such activities out.
      if (next && (layout || canOpen(next, forced))) go(next, options);
    },
    [canOpen, go]
  );

  useEffect(() => {
    for (const event of unseenNavigation(state.navigation, seen.current)) {
      const invited = invitations.current.get(event.from);
      if (invited && event.mode === 'follow.update')
        invitations.current.set(event.from, {
          ...invited,
          view: event.view,
          layout: event.layout,
        });
      const decision = decideNavigation(event, {
        selfUserId: state.selfUserId,
        following: followingRef.current,
        canOpen,
      });
      const name = nameOf(event.from);
      const source: NavigationSource = {
        id: event.id,
        leader: name,
        kind: event.mode === 'summon' ? 'summon' : 'follow',
      };
      switch (decision.kind) {
        case 'navigate': {
          const previous = surfaceRef.current;
          setFollowing(null);
          followingRef.current = null;
          const back = go(decision.view, { forced: true, source });
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
              onClick: () => {
                if (!canOpen(decision.view, false))
                  return void toast(blocked, { id: blockedToast(event.from) });
                // Joining someone else's surface leaves follow mode.
                setFollowing(null);
                followingRef.current = null;
                go(decision.view, { forced: false, source });
              },
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
          startFollowing(decision.leaderId, decision.view, {
            forced: true,
            layout: decision.layout,
            source,
          });
          toast(t('follow.started', { name }));
          break;
        case 'follow-invite': {
          const leaderId = decision.leaderId;
          invitations.current.set(leaderId, {
            view: decision.view,
            layout: decision.layout,
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
                startFollowing(leaderId, latest?.view ?? decision.view, {
                  forced: latest?.forced ?? false,
                  layout: latest ? latest.layout : decision.layout,
                  source,
                });
              },
            },
            cancel: { label: t('navigation.not_now'), onClick: forget },
          });
          break;
        }
        case 'follow-apply':
          go(decision.view, {
            forced: event.forced,
            layout: decision.layout,
            source,
          });
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
        case 'activity-close':
          if (onCloseActivityRef.current?.(decision.view) !== false) {
            toast(
              t('stage_layout.closed_for_everyone_notice', {
                name,
                surface: label(decision.view),
              })
            );
          }
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

  // The leader leaving the call ends following. Nothing else on this side
  // does: the stage is locked while following, so what is on screen may
  // differ from the leader's view only through access, which the mirror
  // already accounts for.
  useEffect(() => {
    if (following && !state.participants[following]) setFollowing(null);
  }, [following, state.participants]);

  // Losing permission mid-session ends leading; the room would refuse updates.
  const allowed = canManage || state.settings.participantNavigation !== false;
  useEffect(() => {
    if (!allowed) setLeading(null);
  }, [allowed]);

  const broadcast = useFollowBroadcast({
    request: room.requestNavigation,
    leading,
    canManage,
    otherIds,
    viewKey: key,
    view,
    layout,
  });

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
      broadcast.start(targets);
      pace();
    },
    stopLeading: () => {
      if (leading)
        room.requestNavigation({ mode: 'follow.stop', targets: leading });
      setLeading(null);
    },
    summon: (targets: NavigationTargets, destination = view) => {
      const count = reached(targets);
      if (!allowed || !count || paused) return;
      room.requestNavigation({ mode: 'summon', targets, view: destination });
      pace();
      toast.success(t(canManage ? 'summon.moved' : 'summon.sent', { count }));
    },
    closeForEveryone: async (destination: MeetRoomView): Promise<boolean> => {
      if (!canManage || paused) return false;
      if (!otherIds.length) return true;
      try {
        await room.closeActivityForEveryone(destination);
        pace();
        return true;
      } catch {
        return false;
      }
    },
    following: following
      ? { leaderId: following, name: nameOf(following) }
      : null,
    stopFollowing: () => setFollowing(null),
    sameView: (other: MeetRoomView) => sameRoomView(view, other),
  };
}

export type RoomNavigation = ReturnType<typeof useRoomNavigation>;
