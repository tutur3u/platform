'use client';

import { showMeetingAiFailure } from '@tuturuuu/meet-core/features/meeting-ai/failure-toast.ts';
import { useTranslations } from 'next-intl';
import { useMeetingAi } from '@/features/meeting-ai/use-meeting-ai';
import { MeetingNotesView } from './meeting-notes-view';
import { NotesHostActions } from './notes-host-actions';
import { NotesVisibility } from './notes-visibility';

/**
 * Meeting page notes and transcript. Data comes from the access-checked
 * meet-ai state route; the page only mounts this for viewers the room policy
 * already allows to read notes.
 */
export function MeetingNotesWorkspace({
  wsId,
  meetingId,
  title,
  isHost,
  shared,
}: {
  wsId: string;
  meetingId: string;
  title: string;
  isHost: boolean;
  shared: boolean;
}) {
  const t = useTranslations('meet.ai');
  const ai = useMeetingAi(wsId, meetingId, [], false);
  const canManage = Boolean(ai.data?.canManage && ai.data.configured);
  return (
    <MeetingNotesView
      wsId={wsId}
      meetingId={meetingId}
      title={title}
      data={ai.data}
      isLoading={ai.isLoading}
      error={ai.error}
      hostActions={
        canManage && ai.data ? (
          <NotesHostActions
            sessions={ai.data.sessions}
            busy={ai.busy}
            onFinish={(sessionId) =>
              void ai
                .finish(sessionId)
                .catch((error: unknown) => showMeetingAiFailure(t, error))
            }
          />
        ) : null
      }
      visibility={
        <NotesVisibility
          wsId={wsId}
          meetingId={meetingId}
          canManage={isHost}
          shared={shared}
        />
      }
    />
  );
}
