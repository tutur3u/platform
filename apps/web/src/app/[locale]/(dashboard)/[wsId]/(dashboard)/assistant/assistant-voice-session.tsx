'use client';

import { executeLiveTool, InternalApiError } from '@tuturuuu/internal-api';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLiveAPIContext } from '@/hooks/use-live-api';
import { AURORA_COLORS, AuroraBlob, StatusPill } from './assistant-visuals';
import type { GroundingMetadata } from './audio/multimodal-live-client';
import { ChatBox } from './components/chat-box/chat-box';
import ControlTray from './components/control-tray/control-tray';
import VideoPreview from './components/video-panel/video-preview';
import { VisualizationContainer } from './components/visualizations/visualization-container';
import type { ServerContent, ToolCall } from './multimodal-live';
import { isModelTurn } from './multimodal-live';
import { useVisualizationStore } from './stores/visualization-store';
import type {
  CoreMentionVisualization,
  GoogleSearchVisualization,
  VisualizationToolResponse,
} from './types/visualizations';

export function stopMediaStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => {
    track.stop();
  });
}

export function AssistantVoiceSession({ wsId }: { wsId: string }) {
  const t = useTranslations('dashboard.voice_assistant');
  const videoRef = useRef<HTMLVideoElement>(null);
  const [textChatOpen, setTextChatOpen] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [activeVideoStream, setActiveVideoStream] =
    useState<MediaStream | null>(null);
  const [videoType, setVideoType] = useState<'webcam' | 'screen' | null>(null);
  const [inputVolume, setInputVolume] = useState(0);
  const [videoStopRequest, setVideoStopRequest] = useState(0);

  const activeVideoStreamRef = useRef<MediaStream | null>(null);

  const {
    client,
    connected,
    connectionStatus,
    disconnect,
    volume,
    onToolCall,
    sendToolResponse,
  } = useLiveAPIContext();
  const disconnectRef = useRef(disconnect);
  disconnectRef.current = disconnect;
  const isUserSpeaking = inputVolume > 0.1;

  useEffect(() => {
    activeVideoStreamRef.current = activeVideoStream;
  }, [activeVideoStream]);

  useEffect(
    () => () => {
      stopMediaStream(activeVideoStreamRef.current);
      void disconnectRef.current();
    },
    []
  );

  // Visualization store
  const {
    addVisualization,
    setCenterVisualization,
    dismissVisualization,
    dismissCenterVisualization,
    dismissAllVisualizations,
  } = useVisualizationStore();

  // Execute a tool call via the API
  const executeToolCall = useCallback(
    async (functionName: string, args: Record<string, unknown>) => {
      try {
        const { result } = await executeLiveTool(
          { wsId, functionName, args },
          { signal: AbortSignal.timeout(15_000) }
        );
        return result;
      } catch (error) {
        console.error('Tool execution error:', error);
        return {
          error:
            error instanceof InternalApiError
              ? error.message
              : 'Failed to execute tool',
        };
      }
    },
    [wsId]
  );

  // Handle tool calls from Gemini
  const handleToolCall = useCallback(
    async (toolCall: ToolCall) => {
      console.debug(
        '[Assistant] Tool call received:',
        toolCall.functionCalls.map((functionCall) => functionCall.name)
      );

      const functionResponses = await Promise.all(
        toolCall.functionCalls.map(async (fc) => {
          console.debug(`[Assistant] Executing tool: ${fc.name}`);

          // Handle highlight_core_topic tool locally (no API call needed)
          if (fc.name === 'highlight_core_topic') {
            const args = fc.args as {
              title: string;
              content: string;
              emphasis?: 'info' | 'warning' | 'success' | 'highlight';
            };

            // Set center visualization (replaces previous)
            const visData: Omit<
              CoreMentionVisualization,
              'id' | 'createdAt' | 'dismissed' | 'side'
            > = {
              type: 'core_mention',
              data: {
                title: args.title,
                content: args.content,
                emphasis: args.emphasis || 'highlight',
              },
            };
            setCenterVisualization(visData);
            console.log('[Assistant] Set core mention visualization');

            return {
              id: fc.id,
              name: fc.name,
              response: {
                success: true,
                message: 'Core topic highlighted on screen',
              },
            };
          }

          // Handle dismiss_core_mention tool locally
          if (fc.name === 'dismiss_core_mention') {
            dismissCenterVisualization();
            console.log('[Assistant] Dismissed core mention visualization');

            return {
              id: fc.id,
              name: fc.name,
              response: { success: true, message: 'Core mention dismissed' },
            };
          }

          // Execute other tools via API
          const result = await executeToolCall(
            fc.name,
            fc.args as Record<string, unknown>
          );
          // Handle visualization actions from backend
          const visResult =
            typeof result.action === 'string'
              ? (result as unknown as VisualizationToolResponse)
              : undefined;
          if (visResult?.action) {
            if (visResult.action === 'dismiss_visualization') {
              if (visResult.visualizationId === 'all') {
                dismissAllVisualizations();
              } else if (visResult.visualizationId) {
                dismissVisualization(visResult.visualizationId);
              }
            } else if (visResult.visualization) {
              // Add visualization to the store
              const visId = addVisualization(visResult.visualization);
              console.log(`[Assistant] Added visualization: ${visId}`);
            }
          }

          // Format response according to Google GenAI SDK requirements
          // Must include id, name, and response object
          // See: https://ai.google.dev/gemini-api/docs/live-tools
          // The response should contain the data directly, not nested
          return {
            id: fc.id,
            name: fc.name,
            response: result,
          };
        })
      );

      // Send tool responses back to Gemini
      sendToolResponse({ functionResponses });
    },
    [
      executeToolCall,
      sendToolResponse,
      addVisualization,
      setCenterVisualization,
      dismissVisualization,
      dismissCenterVisualization,
      dismissAllVisualizations,
    ]
  );

  // Register tool call handler
  useEffect(() => {
    console.log('[Assistant] Registering tool call handler');
    const unsubscribe = onToolCall(handleToolCall);
    return () => {
      console.log('[Assistant] Unregistering tool call handler');
      unsubscribe();
    };
  }, [onToolCall, handleToolCall]);

  // Handle grounding metadata for Google Search visualization
  useEffect(() => {
    if (!client) return;

    const handleGroundingMetadata = (metadata: GroundingMetadata) => {
      // Extract search query and sources
      const query = metadata.webSearchQueries?.[0] || 'Web search';
      const results =
        metadata.groundingChunks
          ?.filter((chunk) => chunk.web)
          .map((chunk) => ({
            title: chunk.web!.title,
            url: chunk.web!.uri,
          })) || [];

      if (results.length > 0) {
        // Add Google Search visualization
        const visData: Omit<
          GoogleSearchVisualization,
          'id' | 'createdAt' | 'dismissed' | 'side'
        > = {
          type: 'google_search',
          data: {
            query,
            results,
            totalResults: results.length,
          },
        };
        const visId = addVisualization(visData);
        console.log(`[Assistant] Added Google Search visualization: ${visId}`);
      }
    };

    client.on('groundingmetadata', handleGroundingMetadata);
    return () => {
      client.off('groundingmetadata', handleGroundingMetadata);
    };
  }, [client, addVisualization]);

  // Handle GoAway message (server requesting graceful disconnection)
  useEffect(() => {
    if (!client) return;

    const handleGoAway = (data: { timeLeft?: string }) => {
      console.log(
        '[Assistant] Server requesting disconnect, time left:',
        data.timeLeft || 'unknown'
      );
      // The session resumption will automatically handle reconnection
      // using the stored session handle
    };

    client.on('goaway', handleGoAway);
    return () => {
      client.off('goaway', handleGoAway);
    };
  }, [client]);

  // Handle GenerationComplete (model finished generating all output)
  useEffect(() => {
    if (!client) return;

    const handleGenerationComplete = () => {
      console.log('[Assistant] Generation complete');
      // Clear transcript state cleanly when generation is complete
      setIsSpeaking(false);
    };

    client.on('generationcomplete', handleGenerationComplete);
    return () => {
      client.off('generationcomplete', handleGenerationComplete);
    };
  }, [client]);

  // Handle transcription from voice (native audio model) or text content (standard model)
  useEffect(() => {
    if (!client) return;

    const handleTranscription = (text: string) => {
      if (text) {
        setIsSpeaking(true);
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
          setIsSpeaking(true);
        }
      }
    };

    // Detect audio output for speaking state
    const handleAudio = () => {
      setIsSpeaking(true);
    };

    const handleTurnComplete = () => {
      setIsSpeaking(false);
    };

    // Listen to both transcription (native audio) and content (standard model)
    client.on('transcription', handleTranscription);
    client.on('content', handleContent);
    client.on('audio', handleAudio);
    client.on('turncomplete', handleTurnComplete);

    return () => {
      client.off('transcription', handleTranscription);
      client.off('content', handleContent);
      client.off('audio', handleAudio);
      client.off('turncomplete', handleTurnComplete);
    };
  }, [client]);

  return (
    <div className="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden rounded-lg">
      {/* Beautiful gradient mesh background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {/* Base gradient */}
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(180deg,
              hsl(270 50% 5%) 0%,
              hsl(260 40% 8%) 50%,
              hsl(250 35% 6%) 100%)`,
          }}
        />

        {/* Animated gradient orbs in background */}
        <motion.div
          className="absolute top-[15%] left-[10%] h-175 w-175 rounded-full"
          style={{
            background: `radial-gradient(circle, ${AURORA_COLORS.purple}40 0%, ${AURORA_COLORS.violet}20 40%, transparent 70%)`,
            filter: 'blur(100px)',
          }}
          animate={{
            x: [0, 80, 0, -40, 0],
            y: [0, -60, 0, 50, 0],
            scale: [1, 1.15, 1, 0.9, 1],
          }}
          transition={{
            duration: 30,
            repeat: Infinity,
            ease: 'linear',
          }}
        />
        <motion.div
          className="absolute top-[20%] right-[5%] h-150 w-150 rounded-full"
          style={{
            background: `radial-gradient(circle, ${AURORA_COLORS.blue}35 0%, ${AURORA_COLORS.cyan}15 40%, transparent 70%)`,
            filter: 'blur(100px)',
          }}
          animate={{
            x: [0, -70, 0, 50, 0],
            y: [0, 70, 0, -45, 0],
            scale: [1, 0.85, 1, 1.12, 1],
          }}
          transition={{
            duration: 28,
            repeat: Infinity,
            ease: 'linear',
            delay: 2,
          }}
        />
        <motion.div
          className="absolute bottom-[10%] left-[20%] h-125 w-125 rounded-full"
          style={{
            background: `radial-gradient(circle, ${AURORA_COLORS.pink}30 0%, ${AURORA_COLORS.rose}15 40%, transparent 70%)`,
            filter: 'blur(100px)',
          }}
          animate={{
            x: [0, 60, 0, -70, 0],
            y: [0, -50, 0, 60, 0],
            scale: [1, 1.2, 1, 0.85, 1],
          }}
          transition={{
            duration: 26,
            repeat: Infinity,
            ease: 'linear',
            delay: 4,
          }}
        />
        <motion.div
          className="absolute right-[15%] bottom-[30%] h-100 w-100 rounded-full"
          style={{
            background: `radial-gradient(circle, ${AURORA_COLORS.amber}25 0%, ${AURORA_COLORS.rose}10 40%, transparent 70%)`,
            filter: 'blur(80px)',
          }}
          animate={{
            x: [0, -50, 0, 40, 0],
            y: [0, 40, 0, -50, 0],
            scale: [1, 1.1, 1, 0.92, 1],
          }}
          transition={{
            duration: 24,
            repeat: Infinity,
            ease: 'linear',
            delay: 6,
          }}
        />

        {/* Subtle noise texture overlay */}
        <div
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          }}
        />

        {/* Vignette effect */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse at center, transparent 0%, transparent 50%, rgba(0,0,0,0.4) 100%)',
          }}
        />
      </div>

      {/* Dynamic UI visualizations */}
      <VisualizationContainer wsId={wsId} />

      {/* Main content area */}
      <main className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center gap-8">
        {/* Greeting text */}
        <AnimatePresence mode="wait">
          {connected && !isUserSpeaking && !isSpeaking && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className="absolute top-[15%] text-center"
            >
              <motion.h1
                className="mb-3 bg-linear-to-r from-foreground via-foreground/80 to-foreground bg-clip-text font-semibold text-2xl tracking-tight md:text-3xl"
                animate={{
                  backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'],
                }}
                transition={{
                  duration: 8,
                  repeat: Infinity,
                  ease: 'linear',
                }}
                style={{
                  backgroundSize: '200% 200%',
                }}
              >
                {t('greeting')}
              </motion.h1>
              <p className="text-foreground/50 text-sm">{t('start_prompt')}</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Aurora Blob */}
        <AuroraBlob
          connected={connected}
          isUserSpeaking={isUserSpeaking}
          isSpeaking={isSpeaking}
          volume={volume}
        />

        {/* Status indicator */}
        <div className="absolute bottom-[22%]">
          <StatusPill
            connected={connected}
            connectionStatus={connectionStatus}
            isUserSpeaking={isUserSpeaking}
            isSpeaking={isSpeaking}
          />
        </div>
      </main>

      {/* Controls */}
      <div className="absolute inset-x-0 bottom-0 z-20">
        <div className="mx-auto flex max-w-3xl flex-col gap-3 p-4 pb-6 md:p-6 md:pb-8">
          <ControlTray
            videoRef={videoRef}
            supportsVideo={true}
            textChatOpen={textChatOpen}
            onToggleChat={() => setTextChatOpen((v) => !v)}
            onVideoStreamChange={(stream, type) => {
              setActiveVideoStream(stream);
              setVideoType(type);
            }}
            onInputVolumeChange={setInputVolume}
            videoStopRequest={videoStopRequest}
          />
          <AnimatePresence>
            {textChatOpen && connected && (
              <ChatBox
                connected={connected}
                disabled={!connected}
                onSubmit={async (text: string) => {
                  client.send({ text }, true);
                }}
              />
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Video preview panel */}
      <VideoPreview
        stream={activeVideoStream}
        type={videoType}
        onClose={() => {
          setActiveVideoStream(null);
          setVideoType(null);
          setVideoStopRequest((request) => request + 1);
        }}
      />

      {/* Hidden video element for frame capture */}
      <video ref={videoRef} autoPlay playsInline muted className="hidden" />
    </div>
  );
}
