'use client';

import { Button } from '@tuturuuu/ui/button';
import { Loader2, Mic, Square } from '@tuturuuu/ui/icons';
import { toast } from '@tuturuuu/ui/sonner';
import { useCallback, useEffect, useRef, useState } from 'react';

interface AudioRecorderProps {
  wsId: string;
  meetingId: string;
  sessionId: string;
  onRecordingComplete?: () => void;
}

export function AudioRecorder({
  wsId,
  meetingId,
  sessionId,
  onRecordingComplete,
}: AudioRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const chunkUploadIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const chunkOrderRef = useRef(0);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    if (chunkUploadIntervalRef.current) {
      clearInterval(chunkUploadIntervalRef.current);
      chunkUploadIntervalRef.current = null;
    }
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== 'inactive'
    ) {
      mediaRecorderRef.current.stop();
    }
    setRecordingTime(0);
    chunkOrderRef.current = 0;
  }, []);

  // Upload audio chunk
  const uploadChunk = useCallback(
    async (audioBlob: Blob, isLastChunk: boolean = false) => {
      try {
        const formData = new FormData();
        formData.append('audio', audioBlob);
        formData.append('chunkOrder', chunkOrderRef.current.toString());
        formData.append('isLastChunk', isLastChunk.toString());

        const response = await fetch(
          `/api/v1/workspaces/${wsId}/meetings/${meetingId}/recordings/${sessionId}/chunks`,
          {
            method: 'POST',
            body: formData,
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Failed to upload audio chunk');
        }

        chunkOrderRef.current++;
        return true;
      } catch (error) {
        console.error('Error uploading audio chunk:', error);
        toast.error('Failed to upload audio chunk');
        return false;
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

      // Create MediaRecorder
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      });

      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      chunkOrderRef.current = 0;

      // Handle data available event
      mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);

          // Upload chunk every 5 seconds (or when recording stops)
          if (audioChunksRef.current.length >= 5) {
            const chunkBlob = new Blob(audioChunksRef.current, {
              type: 'audio/webm',
            });
            const success = await uploadChunk(chunkBlob);
            if (success) {
              audioChunksRef.current = [];
            }
          }
        }
      };

      // Handle recording stop
      mediaRecorder.onstop = async () => {
        // Upload any remaining chunks
        if (audioChunksRef.current.length > 0) {
          const finalChunkBlob = new Blob(audioChunksRef.current, {
            type: 'audio/webm',
          });
          await uploadChunk(finalChunkBlob, true);
        }

        // Stop all tracks
        stream.getTracks().forEach((track) => track.stop());

        setIsRecording(false);
        setIsUploading(false);
        cleanup();

        toast.success('Recording completed successfully');
        onRecordingComplete?.();
      };

      // Handle errors
      mediaRecorder.onerror = (event) => {
        console.error('MediaRecorder error:', event);
        setError('Recording error occurred');
        setIsRecording(false);
        setIsUploading(false);
        cleanup();
        stream.getTracks().forEach((track) => track.stop());
      };

      // Start recording
      mediaRecorder.start(1000); // Collect data every second
      setIsRecording(true);

      // Start timer
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);

      // Start periodic chunk upload (every 10 seconds)
      chunkUploadIntervalRef.current = setInterval(async () => {
        if (audioChunksRef.current.length > 0) {
          setIsUploading(true);
          const chunkBlob = new Blob(audioChunksRef.current, {
            type: 'audio/webm',
          });
          const success = await uploadChunk(chunkBlob);
          if (success) {
            audioChunksRef.current = [];
          }
          setIsUploading(false);
        }
      }, 10000);
    } catch (error) {
      console.error('Error starting recording:', error);
      setError(
        'Failed to start recording. Please check microphone permissions.'
      );
      setIsRecording(false);
    }
  }, [uploadChunk, cleanup, onRecordingComplete]);

  // Stop recording
  const stopRecording = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === 'recording'
    ) {
      mediaRecorderRef.current.stop();
    }
  }, []);

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
      <div className="flex items-center gap-4">
        <Button
          variant={isRecording ? 'destructive' : 'default'}
          size="lg"
          onClick={isRecording ? stopRecording : startRecording}
          disabled={isUploading}
          className="flex items-center gap-2"
        >
          {isRecording ? (
            <>
              <Square className="h-5 w-5" />
              Stop Recording
            </>
          ) : (
            <>
              <Mic className="h-5 w-5" />
              Start Recording
            </>
          )}
        </Button>

        {isUploading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Uploading...
          </div>
        )}
      </div>

      {isRecording && (
        <div className="text-center">
          <div className="font-mono text-2xl font-bold text-dynamic-red">
            {formatTime(recordingTime)}
          </div>
          <div className="text-sm text-muted-foreground">
            Recording in progress...
          </div>
        </div>
      )}

      {error && (
        <div className="rounded bg-dynamic-red/10 px-3 py-2 text-sm text-dynamic-red">
          {error}
        </div>
      )}

      <div className="max-w-md text-center text-xs text-muted-foreground">
        Audio is recorded in chunks and uploaded automatically. Recording will
        continue until you stop it manually.
      </div>
    </div>
  );
}
