'use client';

import {
  MessageSquareText,
  Mic,
  MicOff,
  MonitorUp,
  MonitorX,
  PhoneOff,
  Play,
  Video,
  VideoOff,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import {
  memo,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useLiveAPIContext } from '@/hooks/use-live-api';
import type { UseMediaStreamResult } from '@/hooks/use-media-stream-mux';
import { useScreenCapture } from '@/hooks/use-screen-capture';
import { useWebcam } from '@/hooks/use-webcam';
import { AudioRecorder } from '../../audio/audio-recorder';

export type ControlTrayProps = {
  videoRef: RefObject<HTMLVideoElement | null>;
  children?: ReactNode;
  supportsVideo: boolean;
  onRestartSession?: () => Promise<void>;
  onVideoStreamChange?: (
    stream: MediaStream | null,
    type: 'webcam' | 'screen' | null
  ) => void;
  onInputVolumeChange?: (volume: number) => void;
  onError?: (error: Error) => void;
  videoStopRequest?: number;
  textChatOpen?: boolean;
  onToggleChat?: () => void;
};

export async function runLiveSessionAction({
  connected,
  disconnect,
  onRestartSession,
}: {
  connected: boolean;
  disconnect: () => Promise<void>;
  onRestartSession: () => Promise<void>;
}) {
  if (connected) await disconnect();
  else await onRestartSession();
}

function MediaStreamButton({
  active,
  activeIcon,
  activeLabel,
  disabled,
  inactiveIcon,
  inactiveLabel,
  onError,
  start,
  stop,
}: {
  active: boolean;
  activeIcon: ReactNode;
  activeLabel: string;
  disabled?: boolean;
  inactiveIcon: ReactNode;
  inactiveLabel: string;
  onError: (error: Error) => void;
  start: () => Promise<unknown>;
  stop: () => void;
}) {
  return (
    <Button
      aria-label={active ? activeLabel : inactiveLabel}
      variant="ghost"
      size="icon"
      className={cn(
        'size-10 rounded-full text-muted-foreground hover:bg-foreground/8 hover:text-foreground',
        active && 'bg-primary/10 text-primary'
      )}
      disabled={disabled}
      onClick={() => {
        if (active) stop();
        else {
          void start().catch((error) => {
            onError(error instanceof Error ? error : new Error(String(error)));
          });
        }
      }}
    >
      {active ? activeIcon : inactiveIcon}
    </Button>
  );
}

function ControlTray({
  videoRef,
  children,
  onInputVolumeChange = () => {},
  onError = () => {},
  onRestartSession,
  onVideoStreamChange = () => {},
  supportsVideo,
  textChatOpen,
  onToggleChat,
  videoStopRequest = 0,
}: ControlTrayProps) {
  const t = useTranslations('dashboard.voice_assistant');
  const videoStreams = [useWebcam(), useScreenCapture()];
  const [webcam, screenCapture] = videoStreams;
  const [activeVideoStream, setActiveVideoStream] =
    useState<MediaStream | null>(null);
  const [audioRecorder] = useState(() => new AudioRecorder());
  const [muted, setMuted] = useState(false);
  const renderCanvasRef = useRef<HTMLCanvasElement>(null);
  const sessionButtonRef = useRef<HTMLButtonElement>(null);
  const lastVideoStopRequestRef = useRef(videoStopRequest);
  const videoStreamsRef = useRef(videoStreams);
  const onVideoStreamChangeRef = useRef(onVideoStreamChange);
  videoStreamsRef.current = videoStreams;
  onVideoStreamChangeRef.current = onVideoStreamChange;

  const { client, connected, disconnect } = useLiveAPIContext();
  const canRestart = typeof onRestartSession === 'function';

  useEffect(() => {
    if (!connected) sessionButtonRef.current?.focus();
  }, [connected]);

  useEffect(() => {
    const onData = (base64: string) => {
      client.sendRealtimeInput([
        { data: base64, mimeType: 'audio/pcm;rate=16000' },
      ]);
    };

    if (connected && !muted) {
      audioRecorder.on('data', onData).on('volume', onInputVolumeChange);
      void audioRecorder.start().catch((error) => {
        onError(error instanceof Error ? error : new Error(String(error)));
        void disconnect();
      });
    } else {
      audioRecorder.stop();
    }

    return () => {
      audioRecorder.off('data', onData).off('volume', onInputVolumeChange);
      audioRecorder.stop();
      onInputVolumeChange(0);
    };
  }, [
    audioRecorder,
    client,
    connected,
    disconnect,
    muted,
    onError,
    onInputVolumeChange,
  ]);

  useEffect(() => {
    if (connected) return;
    videoStreamsRef.current.forEach((stream) => {
      stream?.stop();
    });
    setActiveVideoStream(null);
    onVideoStreamChangeRef.current(null, null);
  }, [connected]);

  useEffect(() => {
    if (lastVideoStopRequestRef.current === videoStopRequest) return;
    lastVideoStopRequestRef.current = videoStopRequest;
    videoStreamsRef.current.forEach((stream) => {
      stream?.stop();
    });
    setActiveVideoStream(null);
    onVideoStreamChangeRef.current(null, null);
  }, [videoStopRequest]);

  useEffect(() => {
    if (!videoRef.current || !activeVideoStream) return;
    const video = videoRef.current;
    video.srcObject = activeVideoStream;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let isCapturing = false;

    const captureFrame = () => {
      const canvas = renderCanvasRef.current;
      if (!canvas || !connected || !isCapturing) return;
      if (video.videoWidth === 0 || video.videoHeight === 0) {
        timeoutId = setTimeout(captureFrame, 500);
        return;
      }

      const context = canvas.getContext('2d');
      if (!context) return;
      const scale = Math.min(
        1,
        1024 / Math.max(video.videoWidth, video.videoHeight)
      );
      canvas.width = Math.floor(video.videoWidth * scale);
      canvas.height = Math.floor(video.videoHeight * scale);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const encoded = canvas.toDataURL('image/jpeg', 0.8);
      client.sendRealtimeInput([
        {
          data: encoded.slice(encoded.indexOf(',') + 1),
          mimeType: 'image/jpeg',
        },
      ]);
      timeoutId = setTimeout(captureFrame, 1000);
    };

    const startCapture = () => {
      if (isCapturing) return;
      isCapturing = true;
      captureFrame();
    };

    if (video.readyState >= 2) startCapture();
    else video.addEventListener('loadeddata', startCapture, { once: true });
    void video.play().catch(() => undefined);

    return () => {
      isCapturing = false;
      if (timeoutId) clearTimeout(timeoutId);
      video.removeEventListener('loadeddata', startCapture);
    };
  }, [activeVideoStream, client, connected, videoRef]);

  const changeStreams = (next?: UseMediaStreamResult) => async () => {
    const stream = next ? await next.start() : null;
    setActiveVideoStream(stream);
    onVideoStreamChange(stream, next?.type ?? null);
    videoStreams
      .filter((item) => item !== next)
      .forEach((item) => {
        item.stop();
      });
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl items-center justify-center">
      <div className="flex items-center gap-1.5 rounded-2xl border border-border/60 bg-background/70 p-1.5 shadow-foreground/5 shadow-lg backdrop-blur-xl">
        {connected && (
          <>
            <Button
              aria-label={muted ? t('unmute_microphone') : t('mute_microphone')}
              aria-pressed={muted}
              variant="ghost"
              size="icon"
              className={cn(
                'size-10 rounded-full text-muted-foreground hover:bg-foreground/8 hover:text-foreground',
                muted && 'bg-destructive/10 text-destructive'
              )}
              onClick={() => setMuted((value) => !value)}
            >
              {muted ? (
                <MicOff className="size-4" />
              ) : (
                <Mic className="size-4" />
              )}
            </Button>

            {supportsVideo && (
              <>
                <MediaStreamButton
                  active={Boolean(screenCapture?.isStreaming)}
                  activeIcon={<MonitorX className="size-4" />}
                  activeLabel={t('stop_sharing')}
                  inactiveIcon={<MonitorUp className="size-4" />}
                  inactiveLabel={t('share_screen')}
                  onError={onError}
                  start={changeStreams(screenCapture)}
                  stop={changeStreams()}
                />
                <MediaStreamButton
                  active={Boolean(webcam?.isStreaming)}
                  activeIcon={<VideoOff className="size-4" />}
                  activeLabel={t('disable_camera')}
                  inactiveIcon={<Video className="size-4" />}
                  inactiveLabel={t('enable_camera')}
                  onError={onError}
                  start={changeStreams(webcam)}
                  stop={changeStreams()}
                />
              </>
            )}

            {typeof onToggleChat === 'function' && (
              <Button
                aria-label={textChatOpen ? t('close_chat') : t('open_chat')}
                aria-pressed={Boolean(textChatOpen)}
                variant="ghost"
                size="icon"
                className={cn(
                  'size-10 rounded-full text-muted-foreground hover:bg-foreground/8 hover:text-foreground',
                  textChatOpen && 'bg-primary/10 text-primary'
                )}
                onClick={onToggleChat}
              >
                <MessageSquareText className="size-4" />
              </Button>
            )}

            <span className="mx-0.5 h-6 w-px bg-border/60" />
          </>
        )}

        <Button
          ref={sessionButtonRef}
          aria-label={connected ? t('end_session') : t('new_session')}
          disabled={!connected && !canRestart}
          variant={connected ? 'destructive' : 'default'}
          size="icon"
          className="size-11 rounded-xl shadow-sm"
          onClick={() =>
            void runLiveSessionAction({
              connected,
              disconnect,
              onRestartSession: onRestartSession ?? (() => Promise.resolve()),
            })
          }
        >
          {connected ? (
            <PhoneOff className="size-4" />
          ) : (
            <Play className="size-4" />
          )}
        </Button>

        {children}
      </div>
      <canvas className="hidden" ref={renderCanvasRef} />
    </div>
  );
}

export default memo(ControlTray);
