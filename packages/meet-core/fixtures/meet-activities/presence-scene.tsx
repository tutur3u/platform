'use client';

import { BarChart3, FileText, MessageSquare } from '@tuturuuu/icons';
import type { MeetRealtimePresence } from '@tuturuuu/realtime/meet';
import { useTranslations } from 'next-intl';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { useCallback, useMemo, useState } from 'react';
import { ActivitiesRequestProvider } from '../../src/features/call/stage-layout/activities-request';
import {
  allowedToolIds,
  isActivityAvailable,
} from '../../src/features/call/stage-layout/availability';
import { PresenceStage } from '../../src/features/call/stage-layout/presence-stage';
import { StageLayoutView } from '../../src/features/call/stage-layout/stage-layout-view';
import { usePresence } from '../../src/features/call/stage-layout/use-activity-presence';
import { useStageLayout } from '../../src/features/call/stage-layout/use-stage-layout';
import { liveQaTool } from '../../src/features/call/tools/live-activities/qa/definition';
import { QaPanel } from '../../src/features/call/tools/live-activities/qa/qa-panel';
import { pollsTool } from '../../src/features/call/tools/polls';
import { timersTool } from '../../src/features/call/tools/timers';

const ACTIVE_PARTICIPANTS: readonly MeetRealtimePresence[] = [
  {
    userId: '00000000-0000-4000-8000-000000000099',
    displayName: 'You',
    role: 'host',
    joinedAt: '2026-11-27T00:00:00.000Z',
    lastSeenAt: '2026-11-27T00:00:00.000Z',
    media: { audioEnabled: false, videoEnabled: false, screenEnabled: false },
  },
  {
    userId: '00000000-0000-4000-8000-000000000001',
    displayName: 'Minh Nguyen',
    role: 'speaker',
    joinedAt: '2026-11-27T00:00:00.000Z',
    lastSeenAt: '2026-11-27T00:00:00.000Z',
    media: { audioEnabled: false, videoEnabled: false, screenEnabled: false },
    activeActivityId: 'tool:live-qa',
  },
  {
    userId: '00000000-0000-4000-8000-000000000002',
    displayName: 'Alex Tran',
    role: 'speaker',
    joinedAt: '2026-11-27T00:00:00.000Z',
    lastSeenAt: '2026-11-27T00:00:00.000Z',
    media: { audioEnabled: false, videoEnabled: false, screenEnabled: false },
    activeActivityId: 'tool:live-qa',
    followingUserId: '00000000-0000-4000-8000-000000000001',
  },
  {
    userId: '00000000-0000-4000-8000-000000000003',
    displayName: 'Linh Pham',
    role: 'speaker',
    joinedAt: '2026-11-27T00:00:00.000Z',
    lastSeenAt: '2026-11-27T00:00:00.000Z',
    media: { audioEnabled: false, videoEnabled: false, screenEnabled: false },
    activeActivityId: 'document',
  },
];

const EMPTY_PARTICIPANTS: readonly MeetRealtimePresence[] =
  ACTIVE_PARTICIPANTS.map(({ activeActivityId: _, ...person }) => person);

const FIXTURE_TOOLS = [liveQaTool, pollsTool, timersTool] as const;

export function PresenceSceneFixture({
  canBrowse,
  empty = false,
}: {
  canBrowse: boolean;
  empty?: boolean;
}) {
  const collaborationT = useTranslations('meet.collaboration');
  const qaT = useTranslations('meet.call.live_activities.qa');
  const pollsT = useTranslations('meet.call.polls');
  const [meetingId] = useState(() => `presence-fixture-${Date.now()}`);
  const participants = empty ? EMPTY_PARTICIPANTS : ACTIVE_PARTICIPANTS;
  const toolIds = useMemo(
    () =>
      allowedToolIds(
        canBrowse ? FIXTURE_TOOLS.map((tool) => tool.id) : [],
        []
      ),
    [canBrowse]
  );
  const isAvailable = useCallback(
    (activityId: string) =>
      isActivityAvailable(activityId, {
        live: true,
        collaboration: canBrowse,
        classroom: false,
        toolIds,
      }),
    [canBrowse, toolIds]
  );
  const controller = useStageLayout({
    accountId: 'fixture-user',
    meetingId,
    isAvailable,
  });
  const updateActivityPresence = useCallback(() => {}, []);
  const room = useMemo(
    () => ({
      connectionStatus: 'open' as const,
      state: { selfUserId: '00000000-0000-4000-8000-000000000099' } as never,
      updateActivityPresence,
    }),
    [updateActivityPresence]
  );
  const { presenceByActivity } = usePresence({
    room,
    live: true,
    participants,
    stage: controller,
    nav: { following: null },
  });

  const shownTools = canBrowse ? FIXTURE_TOOLS : [];
  const openToolIds = shownTools
    .map((tool) => tool.id)
    .filter((id) => controller.isOpen(`tool:${id}`));

  const stageElement =
    controller.openIds.length > 0 ? null : (
      <PresenceStage
        stage={controller}
        canBrowse={canBrowse}
        participants={participants}
        selfUserId="00000000-0000-4000-8000-000000000099"
        raisedHandUserIds={['00000000-0000-4000-8000-000000000003']}
        tools={{
          tools: shownTools,
          openToolIds,
          onTool: (id) => controller.toggle(`tool:${id}`),
        }}
        navigationAllowed={canBrowse}
        presenceByActivity={presenceByActivity}
        defaultActivity={empty ? null : 'tool:polls'}
        isAvailable={isAvailable}
      />
    );

  return (
    <NuqsTestingAdapter>
      <ActivitiesRequestProvider>
        <div className="flex h-dvh w-screen flex-col bg-background p-2 text-foreground sm:p-3">
          <main className="min-h-0 flex-1">
            <StageLayoutView
              controller={controller}
              peopleCount={participants.length}
              presenceByActivity={presenceByActivity}
              stage={stageElement}
              activities={controller.openIds.map((id) => {
                if (id === 'tool:live-qa')
                  return {
                    id,
                    title: qaT('title'),
                    icon: MessageSquare,
                    content: <QaPanel meetingId={meetingId} />,
                  };
                if (id === 'tool:polls')
                  return {
                    id,
                    title: pollsT('title'),
                    icon: BarChart3,
                    content: (
                      <div
                        data-testid="presence-opened-polls"
                        className="p-4 text-muted-foreground text-sm"
                      >
                        {pollsT('title')}
                      </div>
                    ),
                  };
                return {
                  id,
                  title: collaborationT('document'),
                  icon: FileText,
                  content: (
                    <div
                      data-testid="presence-opened-document"
                      className="p-4 text-muted-foreground text-sm"
                    >
                      {collaborationT('document')}
                    </div>
                  ),
                };
              })}
            />
          </main>
        </div>
      </ActivitiesRequestProvider>
    </NuqsTestingAdapter>
  );
}
