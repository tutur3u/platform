'use client';

import { Loader2 } from '@tuturuuu/ui/icons';
import { toast } from '@tuturuuu/ui/sonner';
import { useCallback, useEffect, useRef, useState } from 'react';

interface AudioRecorderProps {
  wsId: string;
  meetingId: string;
  sessionId: string;
  isRecording: boolean;
}

export function AudioRecorder({
  wsId,
  meetingId,
  sessionId,
  isRecording,
}: AudioRecorderProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isUploadingRef = useRef(false);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== 'inactive'
    ) {
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setRecordingTime(0);
    isUploadingRef.current = false;
  }, []);

  // Upload complete recording
  const uploadRecording = useCallback(
    async (audioBlob: Blob) => {
      // Prevent concurrent uploads
      if (isUploadingRef.current) {
        console.log('Upload already in progress, skipping...');
        return false;
      }

      try {
        isUploadingRef.current = true;
        setIsUploading(true);

        const formData = new FormData();
        formData.append('audio', audioBlob);

        console.log(`Uploading complete recording (${audioBlob.size} bytes)`);

        const response = await fetch(
          `/api/v1/workspaces/${wsId}/meetings/${meetingId}/recordings/${sessionId}/upload`,
          {
            method: 'POST',
            body: formData,
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to upload recording');
        }

        console.log('Successfully uploaded complete recording');
        return true;
      } catch (error) {
        console.error('Error uploading recording:', error);
        toast.error('Failed to upload recording');
        return false;
      } finally {
        isUploadingRef.current = false;
        setIsUploading(false);
      }
    },
    [wsId, meetingId, sessionId]
  );

  // Start recording
  const startRecording = useCallback(async () => {
    try {
      setError(null);

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Check for supported MIME types
      const supportedTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
      ];

      let mimeType = 'audio/webm;codecs=opus';
      for (const type of supportedTypes) {
        if (MediaRecorder.isTypeSupported(type)) {
          mimeType = type;
          console.log(`Using MIME type: ${mimeType}`);
          break;
        }
      }

      // Create MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
      });

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      isUploadingRef.current = false;

      // Handle data available event - collect chunks but don't upload immediately
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          console.log(`Received audio data: ${event.data.size} bytes`);
          audioChunksRef.current.push(event.data);
        }
      };

      // Handle recording stop
      mediaRecorder.onstop = async () => {
        console.log('Recording stopped, uploading complete recording...');

        // Create complete recording blob
        if (audioChunksRef.current.length > 0) {
          const completeRecordingBlob = new Blob(audioChunksRef.current, {
            type: mimeType,
          });
          console.log(
            `Complete recording size: ${completeRecordingBlob.size} bytes`
          );
          await uploadRecording(completeRecordingBlob);
        }

        setIsUploading(false);
        cleanup();
      };

      // Handle errors
      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event);
        setError('Recording error occurred');
        setIsUploading(false);
        cleanup();
      };

      // Start recording - collect all data until stopped
      mediaRecorder.start();

      // Start timer
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      console.error('Error starting recording:', error);
      setError(
        'Failed to start recording. Please check microphone permissions.'
      );
    }
  }, [uploadRecording, cleanup]);

  // Stop recording
  const stopRecording = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === 'recording'
    ) {
      mediaRecorderRef.current.stop();
    }
  }, []);

  // Effect to handle isRecording prop changes
  useEffect(() => {
    if (isRecording && mediaRecorderRef.current?.state !== 'recording') {
      startRecording();
    } else if (
      !isRecording &&
      mediaRecorderRef.current?.state === 'recording'
    ) {
      stopRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  // Format recording time
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return (
    <div className="border-dynamic-border flex flex-col items-center gap-4 rounded-lg border bg-muted/20 p-4">
      {/* Recording Status Display */}
      {isUploading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Uploading...
        </div>
      )}

      {error && (
        <div className="rounded bg-dynamic-red/10 px-3 py-2 text-sm text-dynamic-red">
          {error}
        </div>
      )}

      {isRecording ? (
        <div className="text-center">
          <div className="font-mono text-2xl font-bold text-dynamic-red">
            {formatTime(recordingTime)}
          </div>
          <div className="text-sm text-muted-foreground">
            Recording in progress...
          </div>
        </div>
      ) : (
        <div className="text-md max-w-md text-center text-muted-foreground">
          {`Ready to record. Click 'Start Recording' to begin.`}
        </div>
      )}
    </div>
  );
}
