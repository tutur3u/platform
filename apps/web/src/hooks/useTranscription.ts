'use client';

import { useQueryClient } from '@tanstack/react-query';
import type { RecordingStatus } from '@tuturuuu/types/db';
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
      const statusResponse = await fetch(
        `/api/v1/workspaces/${wsId}/meetings/${meetingId}/recordings/${sessionId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'transcribing' as RecordingStatus }),
        }
      );

      if (!statusResponse.ok) {
        throw new Error('Failed to update session status');
      }

      // Invalidate queries to show the transcribing status
      queryClient.invalidateQueries({
        queryKey: ['recording-sessions', wsId, meetingId],
      });

      toast.success('Starting transcription...');

      // Step 2: Fetch the audio recording
      const recordingResponse = await fetch(
        `/api/v1/workspaces/${wsId}/meetings/${meetingId}/recordings/${sessionId}/play`,
        { method: 'GET' }
      );

      if (!recordingResponse.ok) {
        const errorData = await recordingResponse.json().catch(() => ({}));
        throw new Error(
          errorData.error ||
            `HTTP ${recordingResponse.status}: ${recordingResponse.statusText}`
        );
      }

      const recordingData = await recordingResponse.json();

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
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.mp3');

      const transcriptionResponse = await fetch(
        '/api/ai/meetings/transcription',
        {
          method: 'POST',
          body: formData,
        }
      );

      if (!transcriptionResponse.ok) {
        const errorText = await transcriptionResponse.text();
        throw new Error(`Transcription failed: ${errorText}`);
      }

      const transcriptionResult = await transcriptionResponse.json();

      // Step 5: Save the transcript and update status to completed
      const saveResponse = await fetch(
        `/api/v1/workspaces/${wsId}/meetings/${meetingId}/recordings/${sessionId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transcript: transcriptionResult,
            status: 'completed' as RecordingStatus,
          }),
        }
      );

      if (!saveResponse.ok) {
        throw new Error('Failed to save transcript');
      }

      // Step 6: Invalidate queries to refresh the UI
      queryClient.invalidateQueries({
        queryKey: ['recording-sessions', wsId, meetingId],
      });

      toast.success('Transcription completed successfully!');
    } catch (error) {
      console.error('Error during transcription:', error);

      // Update status to failed
      try {
        await fetch(
          `/api/v1/workspaces/${wsId}/meetings/${meetingId}/recordings/${sessionId}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'failed' as RecordingStatus }),
          }
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
