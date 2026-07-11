'use client';

import { getWorkspaceMeetingRecordingPlayback } from '@tuturuuu/internal-api';
import { toast } from '@tuturuuu/ui/sonner';
import { useState } from 'react';

interface AudioRecording {
  url: string;
  createdAt: string;
}

interface UseRecordingLoaderProps {
  wsId: string;
  meetingId: string;
  sessionId: string;
}

export function useRecordingLoader({
  wsId,
  meetingId,
  sessionId,
}: UseRecordingLoaderProps) {
  const [audioRecording, setAudioRecording] = useState<AudioRecording | null>(
    null
  );
  const [isLoadingChunks, setIsLoadingChunks] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadRecording = async () => {
    setIsLoadingChunks(true);
    setLoadError(null);
    setAudioRecording(null); // Clear previous recording

    try {
      console.log('Loading recording for session:', sessionId);

      const data = await getWorkspaceMeetingRecordingPlayback<{
        chunks: AudioRecording[];
      }>(wsId, meetingId, sessionId);
      console.log('Received recording data:', data);

      if (data.chunks && data.chunks.length > 0) {
        // Get the first (and only) chunk
        const recording = data.chunks[0];

        if (!recording?.url || recording.url.trim() === '') {
          throw new Error('No valid recording found');
        }

        setAudioRecording(recording);
        toast.success('Recording loaded successfully');
        return recording;
      } else {
        throw new Error('No recording found for this session');
      }
    } catch (error) {
      console.error('Error loading recording:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to load recording';
      setLoadError(errorMessage);
      toast.error(`Failed to load recording: ${errorMessage}`);
      throw error;
    } finally {
      setIsLoadingChunks(false);
    }
  };

  return {
    audioRecording,
    isLoadingChunks,
    loadError,
    loadRecording,
  };
}
