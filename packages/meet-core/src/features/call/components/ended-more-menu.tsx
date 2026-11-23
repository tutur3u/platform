'use client';
import { FileText, ListPlus, MoreHorizontal, Settings2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { EndedManualTask } from './ended-manual-task';
import { EndedMeetingSettings } from './ended-meeting-settings';
import type { EndedReader } from './ended-notes-panel';
import { RestoreRoomButton } from './restore-room-button';

const READER_LABELS = {
  notes: { show: 'show_notes', hide: 'hide_notes' },
  transcript: { show: 'show_transcript', hide: 'hide_transcript' },
  both: { show: 'view_meeting_notes', hide: 'hide_meeting_notes' },
} as const satisfies Record<EndedReader, { show: string; hide: string }>;

/**
 * The ended page's one quiet overflow menu. It holds everything that is not
 * Back to Meet or New meeting, each behind its existing permission.
 */
export function EndedMoreMenu({
  accountId,
  wsId,
  meetingId,
  disabled,
  canRestore,
  canAddTask,
  canManage,
  shareNotesAfterMeeting,
  onShareNotesChange,
  reader,
  readerOpen,
  onToggleReader,
}: {
  accountId: string;
  wsId: string;
  meetingId: string;
  disabled?: boolean;
  canRestore: boolean;
  canAddTask: boolean;
  canManage: boolean;
  shareNotesAfterMeeting?: boolean;
  onShareNotesChange: (enabled: boolean) => void;
  /** Set when the notes reader action lives here instead of the card. */
  reader: EndedReader | null;
  readerOpen: boolean;
  onToggleReader: () => void;
}) {
  const t = useTranslations('meet.call');
  const ai = useTranslations('meet.ai');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            disabled={disabled}
          >
            <MoreHorizontal className="size-4" />
            {t('ended_more')}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="min-w-52">
          {reader && (
            <DropdownMenuItem onSelect={onToggleReader}>
              <FileText className="size-4" />
              {t(READER_LABELS[reader][readerOpen ? 'hide' : 'show'])}
            </DropdownMenuItem>
          )}
          {canAddTask && (
            <DropdownMenuItem onSelect={() => setDraftId(crypto.randomUUID())}>
              <ListPlus className="size-4" />
              {ai('manual_task')}
            </DropdownMenuItem>
          )}
          {canRestore && (
            <RestoreRoomButton
              menuItem
              accountId={accountId}
              meetingId={meetingId}
              disabled={disabled}
            />
          )}
          {(reader || canAddTask || canRestore) && <DropdownMenuSeparator />}
          <DropdownMenuItem onSelect={() => setSettingsOpen(true)}>
            <Settings2 className="size-4" />
            {t('settings_title')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <EndedMeetingSettings
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        wsId={wsId}
        meetingId={meetingId}
        canManage={canManage}
        shareNotesAfterMeeting={shareNotesAfterMeeting}
        onShareNotesChange={onShareNotesChange}
      />
      <EndedManualTask
        wsId={wsId}
        meetingId={meetingId}
        draftId={draftId}
        onClose={() => setDraftId(null)}
      />
    </>
  );
}
