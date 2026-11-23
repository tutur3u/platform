'use client';
import { useQuery } from '@tanstack/react-query';
import { Settings2 } from '@tuturuuu/icons';
import { getMeetAiState } from '@tuturuuu/internal-api';
import { NotesSharingControl } from '@tuturuuu/meet-core/features/meeting-ai/notes-sharing-control';
import { Button, type ButtonProps } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AiCosts } from './ai-costs';
import { CloudflareCosts } from './cloudflare-costs';
import { MeetingPublicSettings } from './meeting-public-settings';
import { RecordingHistory } from './recording-history';

/**
 * Settings for a closed room. Hosts choose here who can read the notes, so
 * the summary card keeps a single row of quiet actions.
 */
export function EndedMeetingSettings({
  wsId,
  meetingId,
  canManage,
  shareNotesAfterMeeting,
  onShareNotesChange,
  variant = 'outline',
  size,
  open: controlledOpen,
  onOpenChange,
}: {
  canManage: boolean;
  /** Present on the ended page: hosts get the after-meeting notes switch. */
  shareNotesAfterMeeting?: boolean;
  onShareNotesChange?: (enabled: boolean) => void;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  /** Controlled by a menu item; the dialog then has no trigger button. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  wsId: string;
  meetingId: string;
}) {
  const t = useTranslations('meet.call');
  const [ownOpen, setOwnOpen] = useState(false);
  const controlled = controlledOpen !== undefined;
  const open = controlled ? controlledOpen : ownOpen;
  const setOpen = controlled ? (onOpenChange ?? (() => {})) : setOwnOpen;
  const ai = useQuery({
    queryKey: ['meet-ai', wsId, meetingId],
    queryFn: () => getMeetAiState(wsId, meetingId),
    enabled: open && canManage,
    retry: false,
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!controlled && (
        <DialogTrigger asChild>
          <Button variant={variant} size={size}>
            <Settings2 className="size-4" />
            {t('settings_title')}
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('settings_title')}</DialogTitle>
        </DialogHeader>
        {canManage && onShareNotesChange && (
          <NotesSharingControl
            wsId={wsId}
            meetingId={meetingId}
            initialEnabled={shareNotesAfterMeeting}
            onChange={onShareNotesChange}
          />
        )}
        <RecordingHistory meetingId={meetingId} />
        {canManage && <MeetingPublicSettings meetingId={meetingId} />}
        {canManage && <CloudflareCosts meetingId={meetingId} />}
        {canManage && ai.data && <AiCosts data={ai.data} />}
      </DialogContent>
    </Dialog>
  );
}
