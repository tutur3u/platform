'use client';

import { MessageSquare } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import {
  createContext,
  useContext,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  ActivityFullscreen,
  ActivityFullscreenButton,
} from '../activity-fullscreen';
import type { MeetToolPanelProps } from '../meet-tool';
import { LiveActivityPanelFrame } from '../panel-frame';
import { QaBoard } from './qa-board';
import { liveQaRoom } from './qa-handler';
import { QaOnScreen } from './qa-on-screen';
import { QaLiveChip } from './qa-parts';
import { liveQaCounts } from './qa-sort';
import type { LiveQaClient } from './qa-store';

export const LiveQaClientContext = createContext<LiveQaClient | null>(null);

/**
 * Live Q&A in the call's side panel, or in full screen with the question on
 * screen beside the list. Host controls follow the room: they appear only
 * while the room sends this person the host view.
 */
export function QaPanel({
  meetingId = 'default',
  onClose,
}: MeetToolPanelProps) {
  const t = useTranslations('meet.call.live_activities.qa');
  const client =
    useContext(LiveQaClientContext) ?? liveQaRoom(meetingId).client;
  const view = useSyncExternalStore(client.subscribe, client.read, client.read);
  const [fullscreen, setFullscreen] = useState(false);
  const counts = liveQaCounts(view.snapshot.questions);
  const meta = (
    <>
      <QaLiveChip />
      {/* A phone header keeps the title, Live and its actions; the counts
          return from the small breakpoint up. */}
      <span className="min-w-0 truncate whitespace-nowrap text-muted-foreground text-xs max-sm:hidden">
        {t('counts', { open: counts.open, answered: counts.answered })}
      </span>
    </>
  );
  const board = { meetingId, client, self: view.self };
  return (
    <LiveActivityPanelFrame
      title={t('title')}
      icon={MessageSquare}
      subtitle={meta}
      actions={<ActivityFullscreenButton onOpen={() => setFullscreen(true)} />}
      onClose={onClose}
      fixedBody={!fullscreen}
    >
      {fullscreen ? (
        <ActivityFullscreen
          open
          onOpenChange={setFullscreen}
          title={t('title')}
          meta={meta}
          aside={
            <QaOnScreen
              questions={view.snapshot.questions}
              board={{ ...board, isHost: view.isHost }}
            />
          }
        >
          <div className="@container min-h-0 flex-1 overflow-y-auto px-4 pt-4 md:px-6">
            <div className="mx-auto max-w-3xl space-y-4">
              <QaBoard view={view} board={board} />
            </div>
          </div>
        </ActivityFullscreen>
      ) : (
        <QaBoard view={view} board={board} layout="pane" />
      )}
    </LiveActivityPanelFrame>
  );
}
