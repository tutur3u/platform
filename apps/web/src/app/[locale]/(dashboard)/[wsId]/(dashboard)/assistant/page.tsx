'use client';

import { useEphemeralToken } from '@/hooks/use-ephemeral-token';
import { LiveAPIProvider, useLiveAPIContext } from '@/hooks/use-live-api';
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from 'framer-motion';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioRecorder } from './audio/audio-recorder';
import { ChatBox } from './components/chat-box/chat-box';
import ControlTray from './components/control-tray/control-tray';
import type { ServerContent, ToolCall } from './multimodal-live';
import { isModelTurn } from './multimodal-live';

function useAudioRecorder() {
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [isRecorderReady, setIsRecorderReady] = useState(false);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const lastSpeakingTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    if (typeof window !== 'undefined') {
      recorderRef.current = new AudioRecorder();
      setIsRecorderReady(true);
      return () => {
        recorderRef.current?.stop();
        setIsRecorderReady(false);
      };
    }
  }, []);

  useEffect(() => {
    const recorder = recorderRef.current;
    if (!recorder) return;

    const handleVolume = (volume: number) => {
      const speaking = volume > 0.1;
      setIsUserSpeaking(speaking);

      if (speaking) {
        lastSpeakingTimeRef.current = Date.now();
      }
    };

    recorder.on('volume', handleVolume);
    return () => {
      recorder.off('volume', handleVolume);
    };
  }, []);

  return { isUserSpeaking, isRecorderReady, recorder: recorderRef.current };
}

function AudioBlob({
  connected,
  volume,
  isUserSpeaking,
}: {
  connected: boolean;
  volume: number;
  isUserSpeaking: boolean;
}) {
  const amplitude = useMotionValue(0);
  const amplitudeSpring = useSpring(amplitude, {
    stiffness: 200,
    damping: 28,
    mass: 0.6,
  });
  const blobScale = useTransform(amplitudeSpring, (v) => 0.85 + v * 0.55);
  const blobOpacity = useTransform(amplitudeSpring, (v) =>
    Math.min(0.85, 0.4 + v * 0.6)
  );

  useEffect(() => {
    const ambientFloor = connected ? 0.28 : 0.18;
    const speakingBoost = isUserSpeaking ? 0.25 : 0;
    const dynamicBoost = volume * 8.2 + speakingBoost;
    const target = Math.min(1.2, Math.max(ambientFloor, dynamicBoost));
    amplitude.set(target);
  }, [connected, volume, amplitude, isUserSpeaking]);

  return (
    <motion.div
      className="pointer-events-none absolute aspect-square w-[35vmin] max-w-[280px]"
      style={{ scale: blobScale, opacity: blobOpacity }}
    >
      {/* Harsh spotlight cone */}
      <motion.div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(circle,
            oklch(0.95 0.05 70 / ${0.3 + volume * 0.4}) 0%,
            oklch(0.75 0.15 70 / ${0.2 + volume * 0.3}) 30%,
            transparent 70%
          )`,
          filter: `blur(${20 - volume * 10}px)`,
        }}
        animate={{
          scale: [1, 1.05, 1],
        }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
      />
      {/* Inner glow core */}
      <motion.span
        className="absolute inset-[20%] rounded-full blur-xl"
        style={{
          background: `radial-gradient(circle, oklch(0.95 0.08 70 / 0.6) 0%, oklch(0.75 0.15 70 / 0.3) 50%, transparent 80%)`,
        }}
        animate={{
          opacity: connected ? [0.6, 0.8, 0.6] : 0.3,
        }}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
      />
    </motion.div>
  );
}

function GameApp({ wsId }: { wsId: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [textChatOpen, setTextChatOpen] = useState(false);
  const [currentTranscript, setCurrentTranscript] = useState('');

  const transcriptRef = useRef('');

  const { client, connected, volume, onToolCall, sendToolResponse } =
    useLiveAPIContext();
  const { isUserSpeaking } = useAudioRecorder();

  // Execute a tool call via the API
  const executeToolCall = useCallback(
    async (functionName: string, args: Record<string, unknown>) => {
      try {
        const response = await fetch('/api/v1/live/tools/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wsId, functionName, args }),
        });

        if (!response.ok) {
          const error = await response.json();
          return { error: error.error || 'Tool execution failed' };
        }

        const data = await response.json();
        return data.result;
      } catch (error) {
        console.error('Tool execution error:', error);
        return { error: 'Failed to execute tool' };
      }
    },
    [wsId]
  );

  // Handle tool calls from Gemini
  const handleToolCall = useCallback(
    async (toolCall: ToolCall) => {
      console.log(
        '[Assistant] Tool call received:',
        JSON.stringify(toolCall, null, 2)
      );

      const functionResponses = await Promise.all(
        toolCall.functionCalls.map(async (fc) => {
          console.log(`[Assistant] Executing tool: ${fc.name}`, fc.args);
          const result = await executeToolCall(
            fc.name,
            fc.args as Record<string, unknown>
          );
          console.log(`[Assistant] Tool result:`, result);
          return {
            id: fc.id,
            response: result,
          };
        })
      );

      // Send tool responses back to Gemini
      console.log('[Assistant] Sending tool responses:', functionResponses);
      sendToolResponse({ functionResponses });
    },
    [executeToolCall, sendToolResponse]
  );

  // Register tool call handler
  useEffect(() => {
    const unsubscribe = onToolCall(handleToolCall);
    return unsubscribe;
  }, [onToolCall, handleToolCall]);

  // Keep transcript ref in sync
  useEffect(() => {
    transcriptRef.current = currentTranscript;
  }, [currentTranscript]);

  // Handle transcription from voice (native audio model) or text content (standard model)
  useEffect(() => {
    if (!client) return;

    const handleTranscription = (text: string) => {
      if (text) {
        setCurrentTranscript((prev) => prev + text);
      }
    };

    // For standard models, text comes through content event
    const handleContent = (content: ServerContent) => {
      if (isModelTurn(content)) {
        const text = content.modelTurn.parts
          .filter((p) => 'text' in p && p.text)
          .map((p) => ('text' in p ? p.text : ''))
          .join('');
        if (text) {
          setCurrentTranscript((prev) => prev + text);
        }
      }
    };

    const handleTurnComplete = () => {
      setCurrentTranscript('');
    };

    // Listen to both transcription (native audio) and content (standard model)
    client.on('transcription', handleTranscription);
    client.on('content', handleContent);
    client.on('turncomplete', handleTurnComplete);

    return () => {
      client.off('transcription', handleTranscription);
      client.off('content', handleContent);
      client.off('turncomplete', handleTurnComplete);
    };
  }, [client]);

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden">
      <main className="relative z-10 flex flex-1 flex-col items-center justify-center overflow-y-auto px-4 pt-20 pb-32">
        <AudioBlob
          connected={connected}
          volume={volume}
          isUserSpeaking={isUserSpeaking}
        />

        {/* Assistant transcript display */}
        <AnimatePresence>
          {currentTranscript && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="-translate-x-1/2 absolute bottom-40 left-1/2 z-20 w-full max-w-2xl px-4"
            >
              <div className="rounded-xl border border-border/40 bg-card/70 px-6 py-4 shadow-lg backdrop-blur-md">
                <p className="text-center text-foreground/90">
                  {currentTranscript}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Controls */}
      <div className="fixed inset-x-0 bottom-0 z-20 bg-linear-to-t from-background to-transparent p-4 md:p-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          <ControlTray
            videoRef={videoRef}
            supportsVideo={false}
            textChatOpen={textChatOpen}
            onToggleChat={() => setTextChatOpen((v) => !v)}
          />
          <AnimatePresence>
            {textChatOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="rounded-xl border border-border/60 bg-card/80 p-2 shadow-lg backdrop-blur-md"
              >
                <ChatBox
                  connected={connected}
                  disabled={!connected}
                  onSubmit={async (text: string) => {
                    client.send({ text }, true);
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const params = useParams();
  const wsId = params.wsId as string;
  const { token, isLoading, error, refreshToken } = useEphemeralToken();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (error || !token) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <div className="text-destructive">
          {error?.message || 'Failed to load. Please try again.'}
        </div>
        <button
          type="button"
          onClick={() => refreshToken()}
          className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <LiveAPIProvider key={token} apiKey={token}>
      <GameApp wsId={wsId} />
    </LiveAPIProvider>
  );
}
