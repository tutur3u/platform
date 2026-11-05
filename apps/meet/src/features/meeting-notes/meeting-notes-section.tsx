import { useTranslations } from 'next-intl';
import { MeetingNotesWorkspace } from './meeting-notes-workspace';
import { type MeetingNotesPolicy, notesAccess } from './notes-access';

/**
 * The meeting notes block shared by every meeting detail surface, live or
 * ended. Viewers the room policy denies get a notice and never start the
 * notes query.
 */
export function MeetingNotesSection({
  wsId,
  meetingId,
  title,
  isHost,
  policy,
  sharingControl = true,
}: {
  wsId: string;
  meetingId: string;
  title: string;
  isHost: boolean;
  policy: MeetingNotesPolicy;
  sharingControl?: boolean;
}) {
  const t = useTranslations('meet.notes_page');
  if (!policy.canReadNotes)
    return (
      <output className="block rounded-xl border bg-muted/30 p-4 text-muted-foreground text-sm">
        {t('not_shared')}
      </output>
    );
  return (
    <MeetingNotesWorkspace
      wsId={wsId}
      meetingId={meetingId}
      title={title}
      access={notesAccess({ isHost })}
      shareNotesAfterMeeting={policy.settings?.shareNotesAfterMeeting === true}
      sharingControl={sharingControl}
    />
  );
}
