'use client';

import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { FileText, Play } from '@tuturuuu/ui/icons';
import { toast } from '@tuturuuu/ui/sonner';
import { useState } from 'react';

interface RecordingSessionActionsProps {
  wsId: string;
  meetingId: string;
  sessionId: string;
  hasTranscription: boolean;
  transcriptionText?: string;
}

export function RecordingSessionActions({
  wsId,
  meetingId,
  sessionId,
  hasTranscription,
  transcriptionText,
}: RecordingSessionActionsProps) {
  const [transcriptDialogOpen, setTranscriptDialogOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  const handleViewTranscript = () => {
    setTranscriptDialogOpen(true);
  };

  const handlePlayRecording = async () => {
    setIsPlaying(true);
    try {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/meetings/${meetingId}/recordings/${sessionId}/play`,
        {
          method: 'GET',
        }
      );

      if (!response.ok) {
        throw new Error('Failed to get recording URLs');
      }

      const data = await response.json();

      if (data.chunks && data.chunks.length > 0) {
        // Create a combined audio player for all chunks
        const audioUrls = data.chunks.map((chunk: any) => chunk.url);

        // For now, we'll play the first chunk
        // In a full implementation, you might want to concatenate all chunks
        const audio = new Audio(audioUrls[0]);
        audio.play();

        toast.success(
          `Playing recording (${data.totalChunks} chunks available)`
        );
      } else {
        toast.error('No audio chunks found for this recording');
      }
    } catch (error) {
      console.error('Error playing recording:', error);
      toast.error('Failed to play recording. Please try again.');
    } finally {
      setIsPlaying(false);
    }
  };

  return (
    <>
      <div className="flex gap-2">
        {hasTranscription && (
          <Button variant="ghost" size="sm" onClick={handleViewTranscript}>
            <FileText className="mr-1 h-3 w-3" />
            View
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={handlePlayRecording}
          disabled={isPlaying}
        >
          <Play className="mr-1 h-3 w-3" />
          {isPlaying ? 'Loading...' : 'Play'}
        </Button>
      </div>

      {/* Transcript Dialog */}
      <Dialog
        open={transcriptDialogOpen}
        onOpenChange={setTranscriptDialogOpen}
      >
        <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Meeting Transcript</DialogTitle>
            <DialogDescription>
              Transcript from the recording session.
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            {transcriptionText ? (
              <div className="text-sm leading-relaxed whitespace-pre-wrap">
                {transcriptionText}
              </div>
            ) : (
              <p className="text-muted-foreground">
                No transcript available for this recording session.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
