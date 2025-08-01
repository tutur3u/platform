'use client';

import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Mic, Share2 } from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { useState } from 'react';

interface MeetingActionsProps {
  wsId: string;
  meetingId: string;
  meetingName: string;
}

export function MeetingActions({ wsId, meetingId }: MeetingActionsProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [shareLink, setShareLink] = useState('');

  const handleStartRecording = async () => {
    setIsRecording(true);
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

      alert('Recording started successfully!');

      // Refresh the page to show the new recording session
      window.location.reload();
    } catch (error) {
      console.error('Error starting recording:', error);
      alert('Failed to start recording. Please try again.');
    } finally {
      setIsRecording(false);
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
      alert('Meeting link copied to clipboard!');
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      alert('Failed to copy link. Please copy it manually.');
    }
  };

  return (
    <>
      <div className="flex gap-4">
        <Button
          variant="outline"
          size="lg"
          className="flex items-center gap-2"
          onClick={handleStartRecording}
          disabled={isRecording}
        >
          <Mic className="h-5 w-5" />
          {isRecording ? 'Starting...' : 'Start Recording'}
        </Button>

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
    </>
  );
}
