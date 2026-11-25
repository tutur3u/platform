'use client';

import type { MeetRoomController } from '../lib/room-controller';
import { useActivityPresentation } from './use-activity-presentation';
import { useMeetCallUx } from '../prejoin/use-meet-call-ux';
import type { StageLayoutController } from './use-stage-layout';

export function useCallActivityPresentation(
  room: MeetRoomController,
  stage: Pick<StageLayoutController, 'open' | 'openIds'>
) {
  const enabled = useMeetCallUx();
  const { state, screenStream } = room;
  const hasActivities = stage.openIds.length > 0;
  const sharers =
    enabled && state.settings.transport !== 'presence'
      ? Object.values(state.participants)
          .filter(
            (person) =>
              person.media.screenEnabled ||
              (person.userId === state.selfUserId && !!screenStream)
          )
          .map((person) => person.userId)
      : [];
  const presentation = useActivityPresentation(
    enabled && hasActivities,
    sharers
  );
  return {
    presentation: enabled ? presentation : undefined,
    activityRail: enabled && hasActivities && !presentation.minimized,
    showActivities: hasActivities && !presentation.minimized,
    revealActivity: enabled
      ? (id: string) => {
          stage.open(id);
          presentation.restore();
        }
      : undefined,
  };
}
