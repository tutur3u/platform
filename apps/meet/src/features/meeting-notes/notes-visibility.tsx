'use client';

import { Eye, Lock } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import { NotesSharingControl } from '@/features/meeting-ai/notes-sharing-control';

/**
 * Hosts manage the existing room-policy share flag; everyone else sees a
 * read-only explanation of why they can read these notes.
 */
export function NotesVisibility({
  wsId,
  meetingId,
  canManage,
  shared,
}: {
  wsId: string;
  meetingId: string;
  canManage: boolean;
  shared: boolean;
}) {
  const t = useTranslations('meet.notes_page');
  if (canManage)
    return (
      <NotesSharingControl
        wsId={wsId}
        meetingId={meetingId}
        initialEnabled={shared}
      />
    );
  const Icon = shared ? Eye : Lock;
  return (
    <p className="flex items-start gap-2 rounded-xl border bg-muted/30 p-4 text-muted-foreground text-sm">
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      {t(shared ? 'visibility_shared' : 'visibility_private')}
    </p>
  );
}
