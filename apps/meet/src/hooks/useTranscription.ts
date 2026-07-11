'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  getWorkspaceMeetingRecordingPlayback,
  transcribeWorkspaceMeetingAudio,
  updateWorkspaceMeetingRecording,
} from '@tuturuuu/internal-api';
import type { RecordingStatus } from '@tuturuuu/types';
import { toast } from '@tuturuuu/ui/sonner';
import { useState } from 'react';

interface UseTranscriptionProps {
  wsId: string;
  meetingId: string;
  sessionId: string;
}

export function useTranscription({
  wsId,
  meetingId,
  sessionId,
}: UseTranscriptionProps) {
  const queryClient = useQueryClient();
  const [isTranscribing, setIsTranscribing] = useState(false);

  const transcribe = async () => {
    if (isTranscribing) return;

    setIsTranscribing(true);

    try {
      // Step 1: Update session status to 'transcribing'
      await updateWorkspaceMeetingRecording(
        wsId,
        meetingId,
        sessionId,
        { status: 'transcribing' as RecordingStatus },
        'PUT'
      );

      // Invalidate queries to show the transcribing status
      queryClient.invalidateQueries({
        queryKey: ['recording-sessions', wsId, meetingId],
      });

      toast.success('Starting transcription...');

      // Step 2: Fetch the audio recording
      const recordingData = await getWorkspaceMeetingRecordingPlayback<{
        chunks: Array<{ url?: string }>;
      }>(wsId, meetingId, sessionId);

      if (!recordingData.chunks || recordingData.chunks.length === 0) {
        throw new Error('No audio recording found');
      }

      const audioUrl = recordingData.chunks[0]?.url;
      if (!audioUrl) {
        throw new Error('Invalid audio recording URL');
      }

      // Step 3: Fetch the actual audio file
      const audioFileResponse = await fetch(audioUrl);
      if (!audioFileResponse.ok) {
        throw new Error('Failed to fetch audio file');
      }

      const audioBlob = await audioFileResponse.blob();

      // Step 4: Send to transcription API
      const transcriptionResult =
        await transcribeWorkspaceMeetingAudio<unknown>(audioBlob);

      // Step 5: Save the transcript and update status to completed
      await updateWorkspaceMeetingRecording(
        wsId,
        meetingId,
        sessionId,
        {
          transcript: transcriptionResult,
          status: 'completed' as RecordingStatus,
        },
        'PATCH'
      );

      // Step 6: Invalidate queries to refresh the UI
      queryClient.invalidateQueries({
        queryKey: ['recording-sessions', wsId, meetingId],
      });

      toast.success('Transcription completed successfully!');
    } catch (error) {
      console.error('Error during transcription:', error);

      // Update status to failed
      try {
        await updateWorkspaceMeetingRecording(
          wsId,
          meetingId,
          sessionId,
          { status: 'failed' as RecordingStatus },
          'PUT'
        );

        // Invalidate queries to show the failed status
        queryClient.invalidateQueries({
          queryKey: ['recording-sessions', wsId, meetingId],
        });
      } catch (statusError) {
        console.error('Failed to update status to failed:', statusError);
      }

      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Failed to transcribe recording';
      toast.error(`Transcription failed: ${errorMessage}`);
    } finally {
      setIsTranscribing(false);
    }
  };

  return {
    isTranscribing,
    transcribe,
  };
}
