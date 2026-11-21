'use client';

import { meetPublicUrl } from '@tuturuuu/utils/meet-url';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Share2, Square } from '@tuturuuu/icons';
import {
  getWorkspaceMeetingRecordings,
  InternalApiError,
  toggleWorkspaceMeetingRecording,
} from '@tuturuuu/internal-api';
import type { RecordingStatus } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { MeetingShareDialog } from '@/features/share-link/meeting-share-dialog';

interface MeetingActionsProps {
  wsId: string;
  meetingId: string;
}

interface RecordingSession {
  id: string;
  status: RecordingStatus;
  created_at: string;
  updated_at: string;
  can_manage: boolean;
}

export function MeetingActions({ wsId, meetingId }: MeetingActionsProps) {
  const queryClient = useQueryClient();
  const t = useTranslations('meet.recording_permissions');
  const tRecorder = useTranslations('meet.legacy_recorder');
  const tShare = useTranslations('meet.share');
  const [stopRecordingDialogOpen, setStopRecordingDialogOpen] = useState(false);
  const [isStoppingSession, setIsStoppingSession] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);

  const activeSessionQueryKey = [
    'active-recording-session',
    wsId,
    meetingId,
  ] as const;
  const { data: activeSession = null } = useQuery({
    queryKey: activeSessionQueryKey,
    queryFn: async () => {
      const data = await getWorkspaceMeetingRecordings<{
        sessions: RecordingSession[];
      }>(wsId, meetingId, { status: 'recording', limit: 1 });
      return data.sessions[0] ?? null;
    },
    staleTime: 15_000,
  });
  const isRecording = activeSession?.status === 'recording';

  const handleStopSession = async () => {
    if (!activeSession?.can_manage) return;

    setIsStoppingSession(true);
    try {
      await toggleWorkspaceMeetingRecording(wsId, meetingId);
      queryClient.setQueryData(activeSessionQueryKey, null);
      toast.success('Recording stopped successfully');

      queryClient.invalidateQueries({
        queryKey: ['recording-sessions', wsId, meetingId],
      });
    } catch (error) {
      console.error('Error stopping recording:', error);
      toast.error(
        error instanceof InternalApiError && error.status === 403
          ? t('denied')
          : 'Failed to stop recording'
      );
    } finally {
      setIsStoppingSession(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* The legacy recorder is retired: no new recordings start here. An
          already-active legacy session can still be ended. */}
      <p className="text-muted-foreground text-sm">{tRecorder('retired')}</p>
      <div className="flex gap-4">
        {isRecording && activeSession?.can_manage ? (
          <Button
            variant="destructive"
            size="lg"
            onClick={() => setStopRecordingDialogOpen(true)}
            disabled={isStoppingSession}
            className="flex items-center gap-2"
          >
            <Square className="h-4 w-4" />
            {isStoppingSession ? 'Ending...' : 'End Recording'}
          </Button>
        ) : null}

        <Button
          variant="outline"
          size="lg"
          onClick={() => setShareDialogOpen(true)}
        >
          <Share2 className="mr-2 h-5 w-5" />
          {tShare('title')}
        </Button>
      </div>

      <MeetingShareDialog
        wsId={wsId}
        meetingId={meetingId}
        fallbackUrl={meetPublicUrl(`/${wsId}/meetings/${meetingId}`)}
        open={shareDialogOpen}
        onOpenChange={setShareDialogOpen}
      />

      {/* Stop Recording Confirmation Dialog */}
      <Dialog
        open={stopRecordingDialogOpen}
        onOpenChange={setStopRecordingDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Stop Recording</DialogTitle>
            <DialogDescription>
              Are you sure you want to stop the recording? The recording will be
              processed and made available for playback.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setStopRecordingDialogOpen(false)}
              disabled={isStoppingSession}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setStopRecordingDialogOpen(false);
                handleStopSession();
              }}
              disabled={isStoppingSession}
              className="flex items-center gap-2"
            >
              <Square className="h-4 w-4" />
              {isStoppingSession ? 'Stopping...' : 'Stop Recording'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
