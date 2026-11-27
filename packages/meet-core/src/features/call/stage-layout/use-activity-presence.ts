'use client';

import { useEffect, useMemo } from 'react';
import type { MeetRoomController } from '../lib/room-controller';
import { useSurfaceLabel } from '../hooks/use-room-navigation';
import { viewOfActivity } from './activity-ids';
import type { ActivityPresencePerson } from './activity-presence';

/** The part of a room participant that carries live activity presence. */
export interface ActivityPresenceSource {
  userId: string;
  displayName: string;
  avatarUrl?: string | null;
  activeActivityId?: string | null;
  followingUserId?: string | null;
}

/**
 * Publishes this person's focused activity and follow state, then derives who
 * is in or following each activity for the headers, the dock and the tiles.
 */
export function usePresence({
  room,
  live,
  participants,
  stage,
  nav,
}: {
  room: Pick<
    MeetRoomController,
    'updateActivityPresence' | 'state' | 'connectionStatus'
  >;
  live: boolean;
  participants: readonly ActivityPresenceSource[];
  stage: { focused?: string | null };
  nav: { following: { leaderId: string } | null };
}) {
  const surfaceLabel = useSurfaceLabel();
  const selfUserId = room.state.selfUserId;
  const focusedActivityId = stage.focused ?? null;
  const followingLeaderId = nav.following?.leaderId ?? null;
  const isOpen = room.connectionStatus === 'open';
  const { updateActivityPresence } = room;
  useEffect(() => {
    if (!live || !isOpen) return;
    updateActivityPresence(focusedActivityId, followingLeaderId);
  }, [live, isOpen, focusedActivityId, followingLeaderId, updateActivityPresence]);
  return useMemo(() => {
    const byActivity: Record<string, ActivityPresencePerson[]> = {};
    const byParticipant: Record<
      string,
      { title: string; following?: boolean }
    > = {};
    const dock: ActivityPresencePerson[] = [];
    for (const person of participants) {
      const isSelfPerson = person.userId === selfUserId;
      const activityId = isSelfPerson
        ? focusedActivityId
        : (person.activeActivityId ?? null);
      if (!activityId) continue;
      const following = isSelfPerson
        ? !!followingLeaderId
        : !!person.followingUserId;
      const view = viewOfActivity(activityId);
      const activityTitle = view ? surfaceLabel(view) : activityId;
      const entry: ActivityPresencePerson = {
        userId: person.userId,
        displayName: person.displayName,
        avatarUrl: person.avatarUrl ?? undefined,
        following,
        activityTitle,
      };
      (byActivity[activityId] ??= []).push(entry);
      byParticipant[person.userId] = { title: activityTitle, following };
      dock.push(entry);
    }
    return {
      presenceByActivity: byActivity,
      participantActivities: byParticipant,
      dockPresence: dock,
    };
  }, [
    participants,
    selfUserId,
    focusedActivityId,
    followingLeaderId,
    surfaceLabel,
  ]);
}
