'use client';

import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type RecordingState = 'idle' | 'requesting' | 'recording' | 'processing';

type RecordingFormat = {
  extension: string;
  fileType: string;
  recorderMimeType?: string;
};

const RECORDING_FORMATS: RecordingFormat[] = [
  {
    extension: 'webm',
    fileType: 'audio/webm',
    recorderMimeType: 'audio/webm;codecs=opus',
  },
  {
    extension: 'webm',
    fileType: 'audio/webm',
    recorderMimeType: 'audio/webm',
  },
  {
    extension: 'm4a',
    fileType: 'audio/mp4',
    recorderMimeType: 'audio/mp4',
  },
  {
    extension: 'ogg',
    fileType: 'audio/ogg',
    recorderMimeType: 'audio/ogg;codecs=opus',
  },
  {
    extension: 'webm',
    fileType: 'audio/webm',
  },
];

function getSupportedRecordingFormat(): RecordingFormat | null {
  if (
    typeof window === 'undefined' ||
    typeof MediaRecorder === 'undefined' ||
    typeof navigator === 'undefined' ||
    !navigator.mediaDevices?.getUserMedia
  ) {
    return null;
  }

  for (const format of RECORDING_FORMATS) {
    if (!format.recorderMimeType) return format;
    if (MediaRecorder.isTypeSupported(format.recorderMimeType)) {
      return format;
    }
  }

  return null;
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => {
    track.stop();
  });
}

export function formatRecordingDuration(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export function useChatAudioRecorder({
  disabled,
  onAudioReady,
}: {
  disabled?: boolean;
  onAudioReady?: (
    file: File,
    options: { submitOnReady: boolean }
  ) => Promise<void> | void;
}) {
  const t = useTranslations('dashboard.mira_chat');
  const supportedFormat = useMemo(() => getSupportedRecordingFormat(), []);
  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const shouldDiscardRef = useRef(false);
  const startedAtRef = useRef<number | null>(null);
  const submitOnReadyRef = useRef(false);

  useEffect(() => {
    if (recordingState !== 'recording') return;

    const timer = window.setInterval(() => {
      const startedAt = startedAtRef.current;
      if (!startedAt) return;
      setElapsedMs(Date.now() - startedAt);
    }, 150);

    return () => {
      window.clearInterval(timer);
    };
  }, [recordingState]);

  useEffect(
    () => () => {
      shouldDiscardRef.current = true;
      mediaRecorderRef.current?.stop();
      mediaRecorderRef.current = null;
      stopStream(streamRef.current);
      streamRef.current = null;
    },
    []
  );

  const finalizeRecording = useCallback(async () => {
    const format = supportedFormat;
    const chunks = chunksRef.current;

    mediaRecorderRef.current = null;
    stopStream(streamRef.current);
    streamRef.current = null;
    startedAtRef.current = null;

    if (shouldDiscardRef.current) {
      shouldDiscardRef.current = false;
      submitOnReadyRef.current = false;
      chunksRef.current = [];
      setElapsedMs(0);
      setRecordingState('idle');
      return;
    }

    if (!format || chunks.length === 0) {
      submitOnReadyRef.current = false;
      chunksRef.current = [];
      setElapsedMs(0);
      setRecordingState('idle');
      toast.error(t('audio_recording_failed'));
      return;
    }

    setRecordingState('processing');

    try {
      const blob = new Blob(chunks, { type: format.fileType });
      if (blob.size === 0) {
        throw new Error('Empty audio blob');
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const file = new File(
        [blob],
        `mira-audio-${timestamp}.${format.extension}`,
        {
          lastModified: Date.now(),
          type: format.fileType,
        }
      );

      await onAudioReady?.(file, {
        submitOnReady: submitOnReadyRef.current,
      });
    } catch (error) {
      console.error('[Mira Chat] Failed to finalize recorded audio:', error);
      toast.error(t('audio_preparation_failed'));
    } finally {
      submitOnReadyRef.current = false;
      chunksRef.current = [];
      setElapsedMs(0);
      setRecordingState('idle');
    }
  }, [onAudioReady, supportedFormat, t]);

  const cancelRecording = useCallback(() => {
    shouldDiscardRef.current = true;
    submitOnReadyRef.current = false;

    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      mediaRecorderRef.current = null;
      stopStream(streamRef.current);
      streamRef.current = null;
      startedAtRef.current = null;
      chunksRef.current = [];
      setElapsedMs(0);
      setRecordingState('idle');
      return;
    }

    recorder.stop();
  }, []);

  const stopRecording = useCallback((options?: { submitOnReady?: boolean }) => {
    submitOnReadyRef.current = options?.submitOnReady === true;
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    recorder.stop();
  }, []);

  const startRecording = useCallback(async () => {
    if (disabled || !onAudioReady) return;
    if (!supportedFormat || recordingState !== 'idle') {
      if (!supportedFormat) {
        toast.error(t('audio_recording_unavailable'));
      }
      return;
    }

    try {
      setRecordingState('requesting');
      shouldDiscardRef.current = false;
      submitOnReadyRef.current = false;
      chunksRef.current = [];

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const recorder = supportedFormat.recorderMimeType
        ? new MediaRecorder(stream, {
            mimeType: supportedFormat.recorderMimeType,
          })
        : new MediaRecorder(stream);

      streamRef.current = stream;
      mediaRecorderRef.current = recorder;
      startedAtRef.current = Date.now();
      setElapsedMs(0);

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onerror = (event) => {
        console.error('[Mira Chat] Audio recorder error:', event);
        toast.error(t('audio_recording_failed'));
        cancelRecording();
      };

      recorder.onstop = () => {
        void finalizeRecording();
      };

      recorder.start(250);
      setRecordingState('recording');
    } catch (error) {
      console.error('[Mira Chat] Failed to start audio recording:', error);
      stopStream(streamRef.current);
      streamRef.current = null;
      mediaRecorderRef.current = null;
      startedAtRef.current = null;
      chunksRef.current = [];
      setElapsedMs(0);
      setRecordingState('idle');

      if (
        error instanceof DOMException &&
        (error.name === 'NotAllowedError' || error.name === 'SecurityError')
      ) {
        toast.error(t('audio_permission_denied'));
        return;
      }

      toast.error(t('audio_recording_failed'));
    }
  }, [
    cancelRecording,
    disabled,
    finalizeRecording,
    onAudioReady,
    recordingState,
    supportedFormat,
    t,
  ]);

  return {
    browserSupportsAudioCapture: !!supportedFormat,
    cancelRecording,
    elapsedMs,
    formatDuration: formatRecordingDuration,
    isRecording: recordingState === 'recording',
    recordingState,
    startRecording,
    stopRecording,
  };
}
