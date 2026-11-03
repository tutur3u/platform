'use client';

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
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

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
  const [stopRecordingDialogOpen, setStopRecordingDialogOpen] = useState(false);
  const [isStoppingSession, setIsStoppingSession] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareLink, setShareLink] = useState('');

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

  const handleShareMeeting = () => {
    const shareUrl = `${window.location.origin}/${wsId}/meetings/${meetingId}`;
    setShareLink(shareUrl);
    setShareDialogOpen(true);
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      toast.success('Meeting link copied to clipboard!');
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      toast.error('Failed to copy link. Please copy it manually.');
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

        <Button variant="outline" size="lg" onClick={handleShareMeeting}>
          <Share2 className="mr-2 h-5 w-5" />
          Share Meeting
        </Button>
      </div>

      {/* Share Meeting Dialog */}
      <Dialog open={shareDialogOpen} onOpenChange={setShareDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share Meeting</DialogTitle>
            <DialogDescription>
              Share this meeting link with others to invite them to join.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="share-link">Meeting Link</Label>
              <div className="flex gap-2">
                <Input
                  id="share-link"
                  value={shareLink}
                  readOnly
                  className="flex-1"
                />
                <Button onClick={copyToClipboard} size="sm">
                  Copy
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShareDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
