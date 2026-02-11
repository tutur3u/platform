'use client';

import { useQueryClient } from '@tanstack/react-query';
import { Mic, Share2, Square } from '@tuturuuu/icons';
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
import { useCallback, useEffect, useState } from 'react';
import { AudioRecorder } from './audio-recorder';

interface MeetingActionsProps {
  wsId: string;
  meetingId: string;
}

interface RecordingSession {
  id: string;
  status: RecordingStatus;
  created_at: string;
  updated_at: string;
}

export function MeetingActions({ wsId, meetingId }: MeetingActionsProps) {
  const queryClient = useQueryClient();
  const [startRecordingDialogOpen, setStartRecordingDialogOpen] =
    useState(false);
  const [stopRecordingDialogOpen, setStopRecordingDialogOpen] = useState(false);
  const [isStartingSession, setIsStartingSession] = useState(false);
  const [isStoppingSession, setIsStoppingSession] = useState(false);
  const [activeSession, setActiveSession] = useState<RecordingSession | null>(
    null
  );
  const [isRecording, setIsRecording] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareLink, setShareLink] = useState('');

  const checkActiveSession = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/meetings/${meetingId}/recordings?status=recording&limit=1`,
        {
          method: 'GET',
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data.sessions && data.sessions.length > 0) {
          setActiveSession(data.sessions[0]);
        }
      }
    } catch (error) {
      console.error('Error checking active session:', error);
    }
  }, [wsId, meetingId]);

  // Check for active recording session on mount
  useEffect(() => {
    checkActiveSession();
  }, [checkActiveSession]);

  const handleStartSession = async () => {
    setIsStartingSession(true);
    try {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/meetings/${meetingId}/record`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to start recording');
      }

      const data = await response.json();

      if (data.action === 'started') {
        setActiveSession({
          id: data.sessionId,
          status: 'recording',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        setIsRecording(true);
        toast.success('Recording session started');
      } else {
        toast.info('Recording session stopped');
        setActiveSession(null);
        setIsRecording(false);
      }
    } catch (error) {
      console.error('Error starting recording:', error);
      toast.error('Failed to start recording. Please try again.');
    } finally {
      setIsStartingSession(false);
    }
  };

  const handleStopSession = async () => {
    if (!activeSession) return;

    setIsStoppingSession(true);
    try {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/meetings/${meetingId}/record`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }
      );

      if (response.ok) {
        setActiveSession(null);
        setIsRecording(false);
        toast.success('Recording stopped successfully');

        queryClient.invalidateQueries({
          queryKey: ['recording-sessions', wsId, meetingId],
        });
      }
    } catch (error) {
      console.error('Error stopping recording:', error);
      toast.error('Failed to stop recording');
    } finally {
      setIsStoppingSession(false);
    }
  };

  const handleShareMeeting = () => {
    const shareUrl = `${window.location.origin}/${wsId}/tumeet/meetings/${meetingId}`;
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
      {/* Unified Recording Controls */}
      <div className="flex gap-4">
        {!isRecording ? (
          <Button
            variant="outline"
            size="lg"
            className="flex items-center gap-2"
            onClick={() => setStartRecordingDialogOpen(true)}
            disabled={isStartingSession}
          >
            <Mic className="h-5 w-5" />
            {isStartingSession ? 'Starting...' : 'Start Recording'}
          </Button>
        ) : (
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
        )}

        <Button variant="outline" size="lg" onClick={handleShareMeeting}>
          <Share2 className="mr-2 h-5 w-5" />
          Share Meeting
        </Button>
      </div>

      {/* Audio Recorder */}
      <AudioRecorder
        wsId={wsId}
        meetingId={meetingId}
        sessionId={activeSession?.id || ''}
        isRecording={isRecording}
      />

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

      {/* Start Recording Confirmation Dialog */}
      <Dialog
        open={startRecordingDialogOpen}
        onOpenChange={setStartRecordingDialogOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start Recording</DialogTitle>
            <DialogDescription>
              Are you sure you want to start recording this meeting? All
              participants will be notified that the recording has started.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setStartRecordingDialogOpen(false)}
              disabled={isStartingSession}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                setStartRecordingDialogOpen(false);
                handleStartSession();
              }}
              disabled={isStartingSession}
              className="flex items-center gap-2"
            >
              <Mic className="h-4 w-4" />
              {isStartingSession ? 'Starting...' : 'Start Recording'}
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
