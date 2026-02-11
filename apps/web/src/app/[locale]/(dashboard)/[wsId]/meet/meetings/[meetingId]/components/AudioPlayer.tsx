'use client';

import {
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Slider } from '@tuturuuu/ui/slider';
import { toast } from '@tuturuuu/ui/sonner';
import { useCallback, useEffect, useRef, useState } from 'react';

interface AudioRecording {
  url: string;
  createdAt: string;
}

interface AudioPlayerProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  audioRecording: AudioRecording | null;
  isLoadingChunks: boolean;
  loadError: string | null;
  onRetry: () => void;
}

export function AudioPlayer({
  isOpen,
  onOpenChange,
  audioRecording,
  isLoadingChunks,
  loadError,
  onRetry,
}: AudioPlayerProps) {
  // Audio playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [totalDuration, setTotalDuration] = useState(0);

  // Audio context refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioBuffersRef = useRef<AudioBuffer[]>([]);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

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

    let isCancelled = false;

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
        toast.error(`Failed to initialize audio player: ${errorMessage}`);
      }
    };

    if (!isCancelled) {
      initializeAudio();
    }

    return () => {
      isCancelled = true;
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

          gainNodeRef.current = audioContextRef.current.createGain();
          gainNodeRef.current.gain.value = isMuted ? 0 : volume;

          source.connect(gainNodeRef.current);
          gainNodeRef.current.connect(audioContextRef.current.destination);

          startTimeRef.current = audioContextRef.current.currentTime - playTime;
          sourceNodeRef.current = source;

          source.onended = handlePlaybackEnd;

          source.start(0, playTime);
          setIsPlaying(true);
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

  useEffect(() => {
    if (gainNodeRef.current && audioContextRef.current) {
      gainNodeRef.current.gain.value = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

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

  // Animation frame management
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
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        // Only allow closing if not loading
        if (!isLoadingChunks && !isLoading) {
          onOpenChange(open);
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
                <p className="text-muted-foreground text-sm">
                  Duration: {formatTime(totalDuration)}
                </p>
                {audioRecording?.createdAt && (
                  <p className="text-muted-foreground text-xs">
                    Recorded:{' '}
                    {new Date(audioRecording.createdAt).toLocaleString()}
                  </p>
                )}
              </div>
              <div className="text-right">
                <div className="font-medium text-dynamic-green text-sm">
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
                  <p className="font-medium text-sm">Loading recording...</p>
                  <p className="text-muted-foreground text-xs">Please wait</p>
                </div>
              </div>
            </div>
          )}

          {/* Error State */}
          {loadError && (
            <div className="rounded-lg border border-dynamic-red/20 bg-dynamic-red/10 p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h4 className="font-medium text-dynamic-red text-sm">
                    Failed to load recording
                  </h4>
                  <p className="mt-1 text-dynamic-red/80 text-xs">
                    {loadError}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onRetry}
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
                <div className="flex items-center justify-between text-muted-foreground text-xs">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(totalDuration)}</span>
                </div>
                <Slider
                  value={[currentTime]}
                  max={totalDuration}
                  step={0.1}
                  onValueChange={(value) => {
                    if (
                      value &&
                      value.length > 0 &&
                      typeof value[0] === 'number'
                    ) {
                      seek(value[0]);
                    }
                  }}
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
  );
}
