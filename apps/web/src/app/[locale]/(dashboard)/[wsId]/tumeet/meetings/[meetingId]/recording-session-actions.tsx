'use client';

import { useQueryClient } from '@tanstack/react-query';
import { RecordingStatus, RecordingTranscript } from '@tuturuuu/types/db';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import {
  Clock,
  EyeIcon,
  FileText,
  Headphones,
  Pause,
  Play,
  Search,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import { Slider } from '@tuturuuu/ui/slider';
import { toast } from '@tuturuuu/ui/sonner';
import { useCallback, useEffect, useRef, useState } from 'react';

interface RecordingSession {
  id: string;
  status: RecordingStatus;
  created_at: string;
  updated_at: string;
  transcript?: RecordingTranscript | null;
}

interface RecordingSessionActionsProps {
  wsId: string;
  meetingId: string;
  session: RecordingSession;
  onDelete?: () => void; // Optional callback for parent
}

export function RecordingSessionActions({
  wsId,
  meetingId,
  session,
  onDelete,
}: RecordingSessionActionsProps) {
  const queryClient = useQueryClient();

  const [transcriptDialogOpen, setTranscriptDialogOpen] = useState(false);
  const [audioPlayerDialogOpen, setAudioPlayerDialogOpen] = useState(false);
  const [audioRecording, setAudioRecording] = useState<{
    url: string;
    createdAt: string;
  } | null>(null);
  const [isLoadingChunks, setIsLoadingChunks] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [totalDuration, setTotalDuration] = useState(0);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptSearchQuery, setTranscriptSearchQuery] = useState('');

  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBuffersRef = useRef<AudioBuffer[]>([]);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const startTimeRef = useRef<number>(0);
  const animationFrameRef = useRef<number | null>(null);
  const previousChunksDurationRef = useRef<number>(0);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs
      .toString()
      .padStart(2, '0')}`;
  };

  // Initialize audio context and load recording
  useEffect(() => {
    if (!audioRecording) return;

    const initializeAudio = async () => {
      try {
        setIsLoading(true);

        // Create audio context
        const AudioContext =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: AudioContext })
            .webkitAudioContext;
        audioContextRef.current = new AudioContext();

        // Ensure audio context is running
        if (audioContextRef.current.state === 'suspended') {
          await audioContextRef.current.resume();
        }

        console.log('Loading complete recording:', audioRecording.url);

        const response = await fetch(audioRecording.url);
        if (!response.ok) {
          throw new Error(`Failed to fetch recording: ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();

        // Validate that we have actual audio data
        if (arrayBuffer.byteLength === 0) {
          throw new Error('Recording is empty');
        }

        console.log(`Recording size: ${arrayBuffer.byteLength} bytes`);

        if (!audioContextRef.current) {
          throw new Error('Audio context is not available');
        }

        let audioBuffer: AudioBuffer;
        try {
          audioBuffer =
            await audioContextRef.current.decodeAudioData(arrayBuffer);
        } catch (decodeError) {
          console.error('Failed to decode recording:', decodeError);

          // Provide specific error information
          if (decodeError instanceof Error) {
            if (decodeError.name === 'EncodingError') {
              throw new Error(
                'Recording has corrupted or unsupported audio format'
              );
            } else if (decodeError.name === 'NotSupportedError') {
              throw new Error('Recording uses an unsupported audio codec');
            } else {
              throw new Error(`Recording decode error: ${decodeError.message}`);
            }
          } else {
            throw new Error('Recording failed to decode');
          }
        }

        // Validate the decoded audio buffer
        if (!audioBuffer || audioBuffer.duration <= 0) {
          throw new Error(
            `Recording has invalid duration: ${audioBuffer?.duration}`
          );
        }

        console.log(
          `Successfully loaded recording, duration: ${audioBuffer.duration}s`
        );

        setLoadError(null);

        audioBuffersRef.current = [audioBuffer];
        setTotalDuration(audioBuffer.duration);

        setIsLoading(false);
        toast.success('Recording loaded successfully');
        console.log(
          `Audio player initialized with recording, duration: ${audioBuffer.duration}s`
        );
      } catch (error) {
        console.error('Error initializing audio player:', error);
        setIsLoading(false);
        const errorMessage =
          error instanceof Error
            ? error.message
            : 'Failed to initialize audio player';
        setLoadError(errorMessage);
        toast.error(`Failed to initialize audio player: ${errorMessage}`);
      }
    };

    initializeAudio();

    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [audioRecording]);

  const updateTime = useCallback(() => {
    if (!isPlaying || !audioContextRef.current || !sourceNodeRef.current) {
      return;
    }

    const currentChunkPlaybackTime =
      audioContextRef.current.currentTime - startTimeRef.current;
    const newCurrentTime =
      previousChunksDurationRef.current + currentChunkPlaybackTime;

    setCurrentTime(Math.min(newCurrentTime, totalDuration));

    animationFrameRef.current = requestAnimationFrame(updateTime);
  }, [isPlaying, totalDuration]);

  const handlePlaybackEnd = useCallback(() => {
    setIsPlaying(false);
    setCurrentTime(totalDuration);
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    previousChunksDurationRef.current = 0;
  }, [totalDuration]);

  // Play audio
  const play = useCallback(
    async (timeToStartFrom?: number) => {
      if (!audioContextRef.current || audioBuffersRef.current.length === 0) {
        toast.error('No audio data available to play');
        return;
      }

      const playTime = timeToStartFrom ?? currentTime;

      try {
        if (audioContextRef.current.state === 'suspended') {
          await audioContextRef.current.resume();
        }

        if (sourceNodeRef.current) {
          sourceNodeRef.current.onended = null;
          sourceNodeRef.current.stop();
        }

        setCurrentTime(playTime);

        const source = audioContextRef.current.createBufferSource();
        const audioBuffer = audioBuffersRef.current[0]; // Single recording

        if (audioBuffer) {
          source.buffer = audioBuffer;
          const gainNode = audioContextRef.current.createGain();
          gainNode.gain.value = isMuted ? 0 : volume;
          source.connect(gainNode);
          gainNode.connect(audioContextRef.current.destination);

          startTimeRef.current = audioContextRef.current.currentTime - playTime;
          sourceNodeRef.current = source;

          source.onended = handlePlaybackEnd;

          source.start(0, playTime);
          setIsPlaying(true);

          // animationFrameRef.current = requestAnimationFrame(updateTime); // This is now managed by the useEffect
        }
      } catch (error) {
        console.error('Error playing audio:', error);
        toast.error('Failed to play audio');
      }
    },
    [currentTime, isMuted, handlePlaybackEnd, volume]
  );

  // Pause audio
  const pause = useCallback(() => {
    if (sourceNodeRef.current) {
      sourceNodeRef.current.onended = null;
      sourceNodeRef.current.stop();
      sourceNodeRef.current = null;
    }
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    setIsPlaying(false);
  }, []);

  // Toggle play/pause
  const togglePlay = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      play();
    }
  }, [isPlaying, play, pause]);

  // Seek to specific time
  const seek = useCallback(
    (time: number) => {
      if (
        !audioContextRef.current ||
        audioBuffersRef.current.length === 0 ||
        !totalDuration
      )
        return;

      const newTime = Math.max(0, Math.min(time, totalDuration));
      setCurrentTime(newTime);

      if (isPlaying) {
        play(newTime);
      }
    },
    [isPlaying, play, totalDuration]
  );

  // Skip forward/backward
  const skip = useCallback(
    (direction: 'forward' | 'backward') => {
      const skipTime = 10; // 10 seconds
      const newTime =
        direction === 'forward'
          ? Math.min(currentTime + skipTime, totalDuration)
          : Math.max(currentTime - skipTime, 0);

      seek(newTime);
    },
    [currentTime, totalDuration, seek]
  );

  // Handle volume change
  const handleVolumeChange = useCallback((newVolume: number[]) => {
    const vol = newVolume[0] ?? 0;
    setVolume(vol);
    setIsMuted(vol === 0);
  }, []);

  // Toggle mute
  const toggleMute = useCallback(() => {
    setIsMuted(!isMuted);
  }, [isMuted]);

  const handleTranscribe = async () => {
    if (isTranscribing) return;

    setIsTranscribing(true);

    try {
      // Step 1: Update session status to 'transcribing'
      const statusResponse = await fetch(
        `/api/v1/workspaces/${wsId}/meetings/${meetingId}/recordings/${session.id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'transcribing' }),
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
        `/api/v1/workspaces/${wsId}/meetings/${meetingId}/recordings/${session.id}/play`,
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
        `/api/v1/workspaces/${wsId}/meetings/${meetingId}/recordings/${session.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transcript: transcriptionResult,
            status: 'completed',
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
          `/api/v1/workspaces/${wsId}/meetings/${meetingId}/recordings/${session.id}`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'failed' }),
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

  const handleViewTranscript = () => {
    setTranscriptDialogOpen(true);
    setTranscriptSearchQuery(''); // Clear search when opening
  };

  // Type guard for segments
  const isSegmentsArray = (
    segments: unknown
  ): segments is Array<{ text: string; start: number; end: number }> => {
    return (
      Array.isArray(segments) &&
      segments.every(
        (s) =>
          typeof s === 'object' &&
          s !== null &&
          typeof s.text === 'string' &&
          typeof s.start === 'number' &&
          typeof s.end === 'number'
      )
    );
  };

  // Filter segments based on search query
  const segments = session.transcript?.segments;
  const validSegments = isSegmentsArray(segments) ? segments : [];
  const filteredSegments = validSegments.filter((segment) =>
    segment.text.toLowerCase().includes(transcriptSearchQuery.toLowerCase())
  );

  // Highlight search matches in text
  const highlightSearchMatches = (text: string, query: string) => {
    if (!query.trim()) return text;

    const regex = new RegExp(`(${query})`, 'gi');
    const parts = text.split(regex);

    return parts.map((part, index) =>
      regex.test(part) ? (
        <mark
          key={index}
          className="rounded bg-yellow-200 px-1 dark:bg-yellow-800"
        >
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  const handlePlayRecording = async () => {
    setIsLoadingChunks(true);
    setLoadError(null);
    setAudioRecording(null); // Clear previous recording

    try {
      console.log('Loading recording for session:', session.id);

      const response = await fetch(
        `/api/v1/workspaces/${wsId}/meetings/${meetingId}/recordings/${session.id}/play`,
        {
          method: 'GET',
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || `HTTP ${response.status}: ${response.statusText}`
        );
      }

      const data = await response.json();
      console.log('Received recording data:', data);

      if (data.chunks && data.chunks.length > 0) {
        // Get the first (and only) chunk
        const recording = data.chunks[0];

        if (!recording.url || recording.url.trim() === '') {
          throw new Error('No valid recording found');
        }

        setAudioRecording(recording);
        setAudioPlayerDialogOpen(true);
        toast.success('Recording loaded successfully');
      } else {
        throw new Error('No recording found for this session');
      }
    } catch (error) {
      console.error('Error loading recording:', error);
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to load recording';
      setLoadError(errorMessage);
      toast.error(`Failed to load recording: ${errorMessage}`);
      setAudioPlayerDialogOpen(false);
    } finally {
      setIsLoadingChunks(false);
    }
  };

  // --- Delete handler ---
  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/meetings/${meetingId}/recordings/${session.id}`,
        { method: 'DELETE' }
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || `HTTP ${response.status}: ${response.statusText}`
        );
      }
      toast.success('Recording session deleted');
      setDeleteDialogOpen(false);
      if (onDelete) onDelete();
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Failed to delete recording session';
      toast.error(errorMessage);
    } finally {
      setIsDeleting(false);
    }
  };

  // --- Add this useEffect for animation frame management ---
  useEffect(() => {
    if (isPlaying) {
      animationFrameRef.current = requestAnimationFrame(updateTime);
      return () => {
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
        }
      };
    } else {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    }
  }, [isPlaying, updateTime]);

  return (
    <>
      <div className="flex gap-2">
        {session.transcript ? (
          <Button variant="outline" size="sm" onClick={handleViewTranscript}>
            <EyeIcon className="mr-1 h-3 w-3" />
            View Transcript
          </Button>
        ) : (
          <Button
            variant="default"
            size="sm"
            onClick={handleTranscribe}
            disabled={isTranscribing || session.status === 'transcribing'}
          >
            <FileText className="mr-1 h-3 w-3" />
            {isTranscribing || session.status === 'transcribing'
              ? 'Transcribing...'
              : 'Transcribe'}
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={handlePlayRecording}
          disabled={isLoadingChunks}
        >
          <Headphones className="mr-1 h-3 w-3" />
          {isLoadingChunks ? 'Loading...' : 'Play'}
        </Button>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => setDeleteDialogOpen(true)}
          disabled={isDeleting}
        >
          Delete
        </Button>
      </div>

      {/* Transcript Dialog */}
      <Dialog
        open={transcriptDialogOpen}
        onOpenChange={setTranscriptDialogOpen}
      >
        <DialogContent className="flex max-h-[80vh] max-w-4xl flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Meeting Transcript
            </DialogTitle>
            <DialogDescription>
              AI-generated transcript from the recording session
            </DialogDescription>
          </DialogHeader>

          {session.transcript ? (
            <div className="flex flex-1 flex-col space-y-4 overflow-hidden">
              {/* Transcript Info Bar */}
              <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-muted/30 p-3 text-sm">
                {session.transcript.language && (
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-muted-foreground">
                      Language:
                    </span>
                    <span className="rounded bg-dynamic-blue/10 px-2 py-1 text-xs font-medium text-dynamic-blue uppercase">
                      {session.transcript.language}
                    </span>
                  </div>
                )}
                {session.transcript.duration_in_seconds && (
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-muted-foreground">
                      Duration:
                    </span>
                    <span>
                      {formatTime(session.transcript.duration_in_seconds)}
                    </span>
                  </div>
                )}
              </div>

              {/* Search Bar */}
              {validSegments.length > 0 && (
                <div className="relative">
                  <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 transform text-muted-foreground" />
                  <Input
                    placeholder="Search transcript..."
                    value={transcriptSearchQuery}
                    onChange={(e) => setTranscriptSearchQuery(e.target.value)}
                    className="pr-10 pl-10"
                  />
                  {transcriptSearchQuery && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute top-1/2 right-1 h-7 w-7 -translate-y-1/2 transform p-0"
                      onClick={() => setTranscriptSearchQuery('')}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              )}

              {/* Transcript Content */}
              <div className="flex-1 overflow-y-auto">
                {validSegments.length > 0 ? (
                  /* Segmented Transcript with Timestamps */
                  <div className="space-y-3">
                    <div className="mb-4 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <h4 className="text-sm font-medium text-muted-foreground">
                          Transcript with Timestamps
                        </h4>
                        <div className="text-xs text-muted-foreground">
                          {transcriptSearchQuery
                            ? `${filteredSegments.length} of ${validSegments.length} segments`
                            : `${validSegments.length} segments`}
                        </div>
                      </div>
                    </div>

                    {transcriptSearchQuery && filteredSegments.length === 0 ? (
                      <div className="py-8 text-center text-muted-foreground">
                        <Search className="mx-auto mb-2 h-8 w-8 opacity-50" />
                        <p>
                          No segments found matching &quot;
                          {transcriptSearchQuery}&quot;
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {(transcriptSearchQuery
                          ? filteredSegments
                          : validSegments
                        ).map((segment, index) => (
                          <div
                            key={
                              transcriptSearchQuery ? `search-${index}` : index
                            }
                            className="group flex gap-4 rounded-lg border bg-background p-3 transition-colors hover:bg-muted/20"
                          >
                            {/* Timestamp */}
                            <div className="w-24 flex-shrink-0 font-mono text-xs text-muted-foreground">
                              <div className="sticky top-0">
                                <div className="font-medium">
                                  {formatTime(segment.start)}
                                </div>
                                <div className="opacity-60">
                                  -{formatTime(segment.end)}
                                </div>
                              </div>
                            </div>

                            {/* Segment Text */}
                            <div className="flex-1 text-sm leading-relaxed">
                              {transcriptSearchQuery
                                ? highlightSearchMatches(
                                    segment.text,
                                    transcriptSearchQuery
                                  )
                                : segment.text}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  /* Full Text Transcript */
                  <div className="space-y-3">
                    <div className="mb-4 flex items-center justify-between">
                      <h4 className="text-sm font-medium text-muted-foreground">
                        Full Transcript
                      </h4>
                      {/* Search Bar for Full Text */}
                      <div className="ml-4 max-w-sm flex-1">
                        <div className="relative">
                          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 transform text-muted-foreground" />
                          <Input
                            placeholder="Search transcript..."
                            value={transcriptSearchQuery}
                            onChange={(e) =>
                              setTranscriptSearchQuery(e.target.value)
                            }
                            className="h-8 pr-10 pl-10 text-sm"
                          />
                          {transcriptSearchQuery && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="absolute top-1/2 right-1 h-6 w-6 -translate-y-1/2 transform p-0"
                              onClick={() => setTranscriptSearchQuery('')}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="rounded-lg border bg-muted/20 p-4">
                      <div className="text-sm leading-relaxed whitespace-pre-wrap">
                        {transcriptSearchQuery
                          ? highlightSearchMatches(
                              session.transcript.text,
                              transcriptSearchQuery
                            )
                          : session.transcript.text}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between border-t pt-3">
                <div className="text-xs text-muted-foreground">
                  Transcript generated by AI • Review for accuracy
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      let text = '';
                      if (validSegments.length > 0) {
                        // Use filtered segments if search is active, otherwise use all segments
                        const segmentsToUse = transcriptSearchQuery
                          ? filteredSegments
                          : validSegments;
                        text = segmentsToUse
                          .map((s) => `[${formatTime(s.start)}] ${s.text}`)
                          .join('\n\n');
                      } else {
                        text = session.transcript?.text || '';
                      }

                      navigator.clipboard.writeText(text);
                      toast.success(
                        transcriptSearchQuery && validSegments.length > 0
                          ? `${filteredSegments.length} filtered segments copied to clipboard`
                          : 'Transcript copied to clipboard'
                      );
                    }}
                  >
                    Copy{' '}
                    {transcriptSearchQuery && validSegments.length > 0
                      ? 'Filtered'
                      : 'All'}{' '}
                    Text
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const transcript = session.transcript;
                      if (!transcript) return;

                      const exportData = {
                        transcript: transcript.text,
                        segments: transcript.segments || [],
                        language: transcript.language,
                        duration: transcript.duration_in_seconds,
                        recordingDate: session.created_at,
                        sessionId: session.id,
                      };

                      const blob = new Blob(
                        [JSON.stringify(exportData, null, 2)],
                        {
                          type: 'application/json',
                        }
                      );
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `transcript-${session.id}-${new Date(session.created_at).toISOString().split('T')[0]}.json`;
                      a.click();
                      URL.revokeObjectURL(url);
                      toast.success('Transcript exported');
                    }}
                  >
                    Export JSON
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center py-12">
              <div className="space-y-3 text-center">
                <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
                <h3 className="text-lg font-semibold">
                  No Transcript Available
                </h3>
                <p className="max-w-sm text-muted-foreground">
                  No transcript is available for this recording session. You can
                  generate one by clicking the &quot;Transcribe&quot; button.
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Audio Player Dialog */}
      <Dialog
        open={audioPlayerDialogOpen}
        onOpenChange={(open) => {
          // Only allow closing if not loading
          if (!isLoadingChunks && !isLoading) {
            setAudioPlayerDialogOpen(open);
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Recording Playback</DialogTitle>
            <DialogDescription>
              Play back the complete recording session.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Recording Info */}
            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">Complete Recording</h3>
                  <p className="text-sm text-muted-foreground">
                    Duration: {formatTime(totalDuration)}
                  </p>
                  {audioRecording?.createdAt && (
                    <p className="text-xs text-muted-foreground">
                      Recorded:{' '}
                      {new Date(audioRecording.createdAt).toLocaleString()}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium text-dynamic-green">
                    Ready to play
                  </div>
                </div>
              </div>
            </div>

            {/* Loading State */}
            {isLoading && (
              <div className="rounded-lg border bg-muted/20 p-4">
                <div className="flex items-center gap-3">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-dynamic-blue border-t-transparent" />
                  <div>
                    <p className="text-sm font-medium">Loading recording...</p>
                    <p className="text-xs text-muted-foreground">Please wait</p>
                  </div>
                </div>
              </div>
            )}

            {/* Error State */}
            {loadError && (
              <div className="rounded-lg border border-dynamic-red/20 bg-dynamic-red/10 p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h4 className="text-sm font-medium text-dynamic-red">
                      Failed to load recording
                    </h4>
                    <p className="mt-1 text-xs text-dynamic-red/80">
                      {loadError}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePlayRecording}
                    disabled={isLoadingChunks}
                    className="ml-4"
                  >
                    {isLoadingChunks ? 'Retrying...' : 'Retry'}
                  </Button>
                </div>
              </div>
            )}

            {/* Audio Controls */}
            {!isLoading && !loadError && (
              <div className="space-y-4">
                {/* Progress Bar */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(totalDuration)}</span>
                  </div>
                  <Slider
                    value={[currentTime]}
                    max={totalDuration}
                    step={0.1}
                    onValueChange={(value) => seek(value[0] ?? 0)}
                    className="w-full"
                  />
                </div>

                {/* Playback Controls */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => skip('backward')}
                      disabled={currentTime === 0}
                    >
                      <SkipBack className="h-4 w-4" />
                    </Button>

                    <Button
                      variant="default"
                      size="lg"
                      onClick={togglePlay}
                      disabled={isLoading}
                      className="h-12 w-12 rounded-full"
                    >
                      {isPlaying ? (
                        <Pause className="h-5 w-5" />
                      ) : (
                        <Play className="h-5 w-5" />
                      )}
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => skip('forward')}
                      disabled={currentTime >= totalDuration}
                    >
                      <SkipForward className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Volume Control */}
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" onClick={toggleMute}>
                      {isMuted ? (
                        <VolumeX className="h-4 w-4" />
                      ) : (
                        <Volume2 className="h-4 w-4" />
                      )}
                    </Button>
                    <Slider
                      value={[isMuted ? 0 : volume]}
                      max={1}
                      step={0.1}
                      onValueChange={handleVolumeChange}
                      className="w-20"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Recording Session?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. Are you sure you want to delete this
              recording session?
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
