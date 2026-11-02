'use client';

import { Eye, ShieldCheck } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import { NotesSharingControl } from '@/features/meeting-ai/notes-sharing-control';
import type { NotesAccess } from './notes-access';

/**
 * Hosts manage the existing room-policy share flag; everyone else sees why
 * they can read these notes.
 */
export function NotesVisibility({
  wsId,
  meetingId,
  access,
  shareNotesAfterMeeting,
  sharingControl,
}: {
  wsId: string;
  meetingId: string;
  access: NotesAccess;
  shareNotesAfterMeeting: boolean;
  sharingControl: boolean;
}) {
  const t = useTranslations('meet.notes_page');
  if (access === 'host')
    return sharingControl ? (
      <NotesSharingControl
        wsId={wsId}
        meetingId={meetingId}
        initialEnabled={shareNotesAfterMeeting}
      />
    ) : null;
  const shared = access === 'shared';
  const Icon = shared ? Eye : ShieldCheck;
  return (
    <p className="flex items-start gap-2 rounded-xl border bg-muted/30 p-4 text-muted-foreground text-sm">
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      {t(shared ? 'visibility_shared' : 'visibility_admin')}
    </p>
  );
}
