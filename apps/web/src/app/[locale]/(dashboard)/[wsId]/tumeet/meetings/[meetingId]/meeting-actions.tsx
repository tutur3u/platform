'use client';

import { AudioRecorder } from './audio-recorder';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Mic, Share2, Square } from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import { useCallback, useEffect, useState } from 'react';

interface MeetingActionsProps {
  wsId: string;
  meetingId: string;
  meetingName: string;
}

interface RecordingSession {
  id: string;
  status:
    | 'recording'
    | 'completed'
    | 'pending_transcription'
    | 'transcribing'
    | 'failed'
    | 'interrupted';
  created_at: string;
  updated_at: string;
}

export function MeetingActions({ wsId, meetingId }: MeetingActionsProps) {
  const [isStartingRecording, setIsStartingRecording] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareLink, setShareLink] = useState('');
  const [activeSession, setActiveSession] = useState<RecordingSession | null>(
    null
  );
  const [showRecorder, setShowRecorder] = useState(false);

  const checkActiveSession = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/meetings/${meetingId}/recordings/active`,
        {
          method: 'GET',
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data.session) {
          setActiveSession(data.session);
          if (data.session.status === 'recording') {
            setShowRecorder(true);
          }
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

  const handleStartRecording = async () => {
    setIsStartingRecording(true);
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
        setShowRecorder(true);
        toast.success('Recording session started');
      } else {
        toast.info('Recording session stopped');
        setActiveSession(null);
        setShowRecorder(false);
      }
    } catch (error) {
      console.error('Error starting recording:', error);
      toast.error('Failed to start recording. Please try again.');
    } finally {
      setIsStartingRecording(false);
    }
  };

  const handleStopRecording = async () => {
    if (!activeSession) return;

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
        setShowRecorder(false);
        toast.success('Recording stopped successfully');
      }
    } catch (error) {
      console.error('Error stopping recording:', error);
      toast.error('Failed to stop recording');
    }
  };

  const handleRecordingComplete = () => {
    setActiveSession(null);
    setShowRecorder(false);
    // Refresh the page to show the completed recording
    window.location.reload();
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
    <>
      <div className="space-y-4">
        {/* Recording Controls */}
        {!showRecorder ? (
          <div className="flex gap-4">
            <Button
              variant="outline"
              size="lg"
              className="flex items-center gap-2"
              onClick={handleStartRecording}
              disabled={isStartingRecording}
            >
              <Mic className="h-5 w-5" />
              {isStartingRecording ? 'Starting...' : 'Start Recording'}
            </Button>

            <Button variant="outline" size="lg" onClick={handleShareMeeting}>
              <Share2 className="mr-2 h-5 w-5" />
              Share Meeting
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Recording Session</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={handleStopRecording}
                className="flex items-center gap-2"
              >
                <Square className="h-4 w-4" />
                Stop Session
              </Button>
            </div>

            <AudioRecorder
              wsId={wsId}
              meetingId={meetingId}
              sessionId={activeSession?.id || ''}
              onRecordingComplete={handleRecordingComplete}
            />
          </div>
        )}

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
              <Button
                variant="outline"
                onClick={() => setShareDialogOpen(false)}
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}
