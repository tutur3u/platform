'use client';

import { useQueryClient } from '@tanstack/react-query';
import {
  getWorkspaceMeetingRecordingPlayback,
  transcribeWorkspaceMeetingAudio,
  updateWorkspaceMeetingRecording,
} from '@tuturuuu/internal-api';
import type { RecordingStatus } from '@tuturuuu/types';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface UseTranscriptionProps {
  wsId: string;
  meetingId: string;
  sessionId: string;
}

function getTranscriptionInputError(error: unknown) {
  if (!(error instanceof Error)) return null;
  const code = 'code' in error ? error.code : undefined;
  const status = 'status' in error ? error.status : undefined;
  return {
    code: typeof code === 'string' ? code : undefined,
    status: typeof status === 'number' ? status : undefined,
  };
}

export function useTranscription({
  wsId,
  meetingId,
  sessionId,
}: UseTranscriptionProps) {
  const t = useTranslations('meet.transcription');
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

      let errorMessage: string;
      let knownInputError = false;
      const inputError = getTranscriptionInputError(error);
      if (inputError) {
        if (
          inputError.code === 'TRANSCRIPTION_AUDIO_TOO_LARGE' ||
          inputError.status === 413
        ) {
          errorMessage = t('too_large');
          knownInputError = true;
        } else if (
          inputError.code === 'UNSUPPORTED_TRANSCRIPTION_AUDIO_TYPE' ||
          inputError.status === 415
        ) {
          errorMessage = t('unsupported_type');
          knownInputError = true;
        } else if (
          inputError.code === 'EMPTY_TRANSCRIPTION_AUDIO' ||
          inputError.status === 400
        ) {
          errorMessage = t('empty');
          knownInputError = true;
        } else {
          errorMessage =
            error instanceof Error
              ? error.message
              : 'Failed to transcribe recording';
        }
      } else {
        errorMessage =
          error instanceof Error
            ? error.message
            : 'Failed to transcribe recording';
      }
      toast.error(
        knownInputError ? errorMessage : `Transcription failed: ${errorMessage}`
      );
    } finally {
      setIsTranscribing(false);
    }
  };

  return {
    isTranscribing,
    transcribe,
  };
}
