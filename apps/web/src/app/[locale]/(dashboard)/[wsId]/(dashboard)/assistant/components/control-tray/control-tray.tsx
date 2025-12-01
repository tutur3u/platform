'use client';

import { useLiveAPIContext } from '@/hooks/use-live-api';
import type { UseMediaStreamResult } from '@/hooks/use-media-stream-mux';
import { useScreenCapture } from '@/hooks/use-screen-capture';
import { useWebcam } from '@/hooks/use-webcam';
import {
  ImageIcon,
  ImageOff,
  MessageSquareText,
  Mic,
  MicOff,
  MonitorUp,
  MonitorX,
  Pause,
  Play,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type Variants,
} from 'framer-motion';
import {
  memo,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AudioRecorder } from '../../audio/audio-recorder';

export type ControlTrayProps = {
  videoRef: RefObject<HTMLVideoElement | null>;
  children?: ReactNode;
  supportsVideo: boolean;
  onVideoStreamChange?: (stream: MediaStream | null) => void;
  // New: Chat toggle props
  textChatOpen?: boolean;
  onToggleChat?: () => void;
};

type MediaStreamButtonProps = {
  isStreaming: boolean;
  onIcon: ReactNode;
  offIcon: ReactNode;
  start: () => Promise<any>;
  stop: () => any;
  disabled?: boolean;
};

/**
 * button used for triggering webcam or screen-capture
 */
const MediaStreamButton = memo(
  ({
    isStreaming,
    onIcon,
    offIcon,
    start,
    stop,
    disabled,
  }: MediaStreamButtonProps) =>
    isStreaming ? (
      <Button
        variant="ghost"
        size="icon"
        className="h-12 w-12 hover:bg-foreground/10"
        onClick={stop}
        disabled={disabled}
      >
        {onIcon}
      </Button>
    ) : (
      <Button
        variant="ghost"
        size="icon"
        className="h-12 w-12 hover:bg-foreground/10"
        onClick={start}
        disabled={disabled}
      >
        {offIcon}
      </Button>
    )
);

const trayContainerVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 12,
    scale: 0.97,
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.35,
      ease: [0.16, 1, 0.3, 1],
      when: 'beforeChildren',
      staggerChildren: 0.08,
    },
  },
  exit: {
    opacity: 0,
    y: 8,
    scale: 0.95,
    transition: {
      duration: 0.22,
      ease: 'easeInOut',
      staggerChildren: 0.05,
      staggerDirection: -1,
    },
  },
};

const controlGroupVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 20,
    scale: 0.92,
    filter: 'blur(8px)',
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: 'blur(0px)',
    transition: {
      duration: 0.4,
      ease: [0.16, 1, 0.3, 1],
    },
  },
  exit: {
    opacity: 0,
    y: -16,
    scale: 0.95,
    filter: 'blur(6px)',
    transition: {
      duration: 0.22,
      ease: 'easeInOut',
    },
  },
};

const connectButtonVariants: Variants = {
  connected: {
    scale: 1,
    boxShadow: '0px 12px 30px rgba(34, 197, 94, 0.25)',
    transition: {
      type: 'spring',
      stiffness: 320,
      damping: 24,
    },
  },
  disconnected: {
    scale: 1.05,
    boxShadow: '0px 16px 32px rgba(59, 130, 246, 0.25)',
    transition: {
      type: 'spring',
      stiffness: 300,
      damping: 20,
    },
  },
};

function ControlTray({
  videoRef,
  children,
  onVideoStreamChange = () => {},
  supportsVideo,
  textChatOpen,
  onToggleChat,
}: ControlTrayProps) {
  const videoStreams = [useWebcam(), useScreenCapture()];
  const [activeVideoStream, setActiveVideoStream] =
    useState<MediaStream | null>(null);
  const [webcam, screenCapture] = videoStreams;
  const [, setInVolume] = useState(0);
  const [audioRecorder] = useState(() => new AudioRecorder());
  const [muted, setMuted] = useState(false);
  const [connectHovered, setConnectHovered] = useState(false);
  const outputVolumeMotion = useMotionValue(0);
  const outputVolumeSpring = useSpring(outputVolumeMotion, {
    stiffness: 220,
    damping: 30,
    mass: 0.45,
  });
  const outputBlobScale = useTransform(
    outputVolumeSpring,
    (value) => 0.65 + Math.min(1.25, value * 1.4)
  );
  const outputBlobOpacity = useTransform(outputVolumeSpring, (value) =>
    Math.min(0.95, Math.max(0, value * 0.9))
  );
  const outputBlobRotate = useTransform(
    outputVolumeSpring,
    (value) => -10 + Math.min(18, value * 36)
  );
  const outputBlobBlur = useTransform(
    outputVolumeSpring,
    (value) => `blur(${10 + Math.min(20, value * 24)}px)`
  );
  const renderCanvasRef = useRef<HTMLCanvasElement>(null);
  const connectButtonRef = useRef<HTMLButtonElement>(null);

  const { client, connected, connect, disconnect, volume } =
    useLiveAPIContext();

  useEffect(() => {
    if (!connected && connectButtonRef.current) {
      connectButtonRef.current.focus();
    }
  }, [connected]);

  // Move visual effect handling to useEffect
  useEffect(() => {
    if (volume > 0 || connected) {
      document.documentElement.style.setProperty(
        '--volume',
        `${Math.max(5, Math.min(volume * 200, 8))}px`
      );
    }
  }, [volume, connected]);

  useEffect(() => {
    outputVolumeMotion.set(Math.min(1.4, volume * 6));
  }, [volume, outputVolumeMotion]);

  useEffect(() => {
    const onData = (base64: string) => {
      client.sendRealtimeInput([
        {
          mimeType: 'audio/pcm;rate=16000',
          data: base64,
        },
      ]);
    };

    if (connected && !muted && audioRecorder) {
      audioRecorder.on('data', onData).on('volume', setInVolume).start();
      audioRecorder.stream?.getAudioTracks().forEach((track) => {
        track.enabled = true;
      });
    } else {
      audioRecorder.stop();
    }
    return () => {
      audioRecorder.off('data', onData).off('volume', setInVolume);
    };
  }, [connected, client, muted, audioRecorder]);

  useEffect(() => {
    if (!videoRef?.current || !activeVideoStream) return;
    videoRef.current.srcObject = activeVideoStream;
    let frameId = -1;
    let timeoutId = -1;

    function sendVideoFrame() {
      const video = videoRef.current;
      const canvas = renderCanvasRef.current;

      if (!video || !canvas) {
        return;
      }

      const ctx = canvas.getContext('2d');
      canvas.width = video.videoWidth * 0.25;
      canvas.height = video.videoHeight * 0.25;

      if (videoRef.current && canvas.width + canvas.height > 0) {
        ctx?.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        const base64 = canvas.toDataURL('image/jpeg', 1.0);
        const data = base64.slice(base64.indexOf(',') + 1, Infinity);
        client.sendRealtimeInput([{ mimeType: 'image/jpeg', data }]);
      }

      if (connected) {
        timeoutId = window.setTimeout(sendVideoFrame, 1000 / 0.5);
      }
    }

    if (connected && activeVideoStream) {
      frameId = requestAnimationFrame(sendVideoFrame);
    }

    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(timeoutId);
    };
  }, [connected, activeVideoStream, client, videoRef]);

  //handler for swapping from one video-stream to the next
  const changeStreams = (next?: UseMediaStreamResult) => async () => {
    if (next) {
      const mediaStream = await next.start();
      setActiveVideoStream(mediaStream);
      onVideoStreamChange(mediaStream);
    } else {
      setActiveVideoStream(null);
      onVideoStreamChange(null);
    }

    videoStreams
      .filter((msr) => msr !== next)
      .forEach((msr) => {
        msr.stop();
      });
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl items-center justify-center">
      <motion.div layout className="flex items-center gap-4">
        <AnimatePresence initial={false} mode="popLayout">
          {connected && (
            <motion.div
              key="connected-controls"
              layout
              className="flex items-center gap-4"
              variants={trayContainerVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              {/* Left group - Audio controls */}
              <motion.div
                layout
                className="relative flex items-center gap-2 overflow-visible rounded-2xl p-2"
                variants={controlGroupVariants}
              >
                <motion.span
                  aria-hidden
                  className="-inset-10 -z-10 pointer-events-none absolute"
                  style={{
                    scale: outputBlobScale,
                    opacity: outputBlobOpacity,
                    rotate: outputBlobRotate,
                    filter: outputBlobBlur,
                  }}
                  animate={{
                    borderRadius: [
                      '48% 52% 58% 42%',
                      '53% 47% 50% 50%',
                      '44% 56% 60% 40%',
                      '52% 48% 54% 46%',
                    ],
                  }}
                  transition={{
                    duration: 5.6,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                >
                  <span className="absolute inset-0 rounded-[inherit] bg-[radial-gradient(circle_at_25%_30%,rgba(96,165,250,0.45),transparent_60%),radial-gradient(circle_at_70%_25%,rgba(74,222,128,0.4),transparent_55%),radial-gradient(circle_at_50%_80%,rgba(244,114,182,0.45),transparent_58%)] opacity-80 mix-blend-screen blur-3xl" />
                </motion.span>
                <Button
                  variant={!muted && connected ? 'destructive' : 'ghost'}
                  size="icon"
                  className="h-12 w-12"
                  disabled={!connected}
                  onClick={() => setMuted(!muted)}
                >
                  {!muted && connected ? (
                    <Mic size={20} />
                  ) : (
                    <MicOff size={20} />
                  )}
                </Button>
              </motion.div>

              {/* Center group - Video controls */}
              {supportsVideo && (
                <motion.div
                  layout
                  className="flex items-center gap-2 rounded-2xl p-2"
                  variants={controlGroupVariants}
                >
                  <MediaStreamButton
                    isStreaming={screenCapture?.isStreaming || false}
                    start={changeStreams(screenCapture)}
                    stop={changeStreams()}
                    onIcon={<MonitorUp size={20} />}
                    offIcon={<MonitorX size={20} />}
                    disabled={!connected}
                  />
                  <MediaStreamButton
                    isStreaming={webcam?.isStreaming || false}
                    start={changeStreams(webcam)}
                    stop={changeStreams()}
                    onIcon={<ImageIcon size={20} />}
                    offIcon={<ImageOff size={20} />}
                    disabled={!connected}
                  />
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Chat toggle appears only when connected and handler provided */}
        {connected && typeof onToggleChat === 'function' && (
          <Button
            variant="ghost"
            size="icon"
            className="h-12 w-12 hover:bg-foreground/10"
            aria-pressed={Boolean(textChatOpen)}
            aria-label={textChatOpen ? 'Hide chat' : 'Show chat'}
            onClick={onToggleChat}
          >
            <MessageSquareText size={20} />
          </Button>
        )}

        {/* Right group - Connection control + Chat toggle */}
        <motion.div
          layout
          variants={connectButtonVariants}
          initial={false}
          animate={connected ? 'connected' : 'disconnected'}
          className="relative flex items-center gap-2 rounded-2xl"
          style={{ boxShadow: '0px 0px 0px rgba(0,0,0,0)' }}
        >
          <AnimatePresence>
            {connectHovered && (
              <motion.span
                key="connect-blob"
                className="-inset-6 -z-10 pointer-events-none absolute"
                initial={{ opacity: 0, scale: 0.45, rotate: -12 }}
                animate={{ opacity: 1, scale: 1.12, rotate: 0 }}
                exit={{ opacity: 0, scale: 0.3, rotate: 8 }}
                transition={{ type: 'spring', stiffness: 260, damping: 26 }}
              >
                <motion.span
                  className="absolute inset-0 rounded-[45%] bg-[radial-gradient(circle_at_20%_20%,rgba(74,222,128,0.48),transparent_60%),radial-gradient(circle_at_80%_25%,rgba(59,130,246,0.45),transparent_55%),radial-gradient(circle_at_50%_80%,rgba(192,132,252,0.52),transparent_60%)] opacity-90 mix-blend-screen blur-2xl"
                  animate={{
                    scale: [0.95, 1.08, 0.98, 1.12],
                    rotate: [0, 8, -6, 0],
                    borderRadius: [
                      '44% 56% 58% 42%',
                      '50% 50% 46% 54%',
                      '40% 60% 55% 45%',
                      '44% 56% 58% 42%',
                    ],
                  }}
                  transition={{
                    duration: 2.6,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  }}
                />
              </motion.span>
            )}
          </AnimatePresence>
          <Button
            ref={connectButtonRef}
            variant="ghost"
            size="icon"
            className={cn(
              'h-16 w-16 hover:bg-transparent',
              connected &&
                'bg-foreground text-background hover:bg-transparent hover:text-foreground'
            )}
            onClick={connected ? disconnect : connect}
            onPointerEnter={() => setConnectHovered(true)}
            onPointerLeave={() => setConnectHovered(false)}
          >
            {connected ? <Pause size={20} /> : <Play size={20} />}
          </Button>
        </motion.div>

        {children ? (
          <motion.div
            layout
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            {children}
          </motion.div>
        ) : null}
      </motion.div>

      <canvas className="hidden" ref={renderCanvasRef} />
    </div>
  );
}

export default memo(ControlTray);
