'use client';

import { AnimatePresence } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { useLiveAPIContext } from '@/hooks/use-live-api';
import { StatusPill } from './assistant-visuals';
import type { GroundingMetadata } from './audio/multimodal-live-client';
import { ChatBox } from './components/chat-box/chat-box';
import ControlTray from './components/control-tray/control-tray';
import { LiveCalendarResult } from './components/live-calendar-result';
import { LiveWorkspace } from './components/live-workspace';
import VideoPreview from './components/video-panel/video-preview';
import { VisualizationContainer } from './components/visualizations/visualization-container';
import type { ServerContent } from './multimodal-live';
import { isModelTurn } from './multimodal-live';
import { useVisualizationStore } from './stores/visualization-store';
import type { GoogleSearchVisualization } from './types/visualizations';
import { useLiveJournal } from './use-live-journal';
import { useLiveTools } from './use-live-tools';

export function stopMediaStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => {
    track.stop();
  });
}

export function AssistantVoiceSession({
  onError,
  onRestartSession,
  wsId,
}: {
  onError: (error: Error) => void;
  onRestartSession: () => Promise<void>;
  wsId: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [textChatOpen, setTextChatOpen] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [activeVideoStream, setActiveVideoStream] =
    useState<MediaStream | null>(null);
  const [videoType, setVideoType] = useState<'webcam' | 'screen' | null>(null);
  const [inputVolume, setInputVolume] = useState(0);
  const [videoStopRequest, setVideoStopRequest] = useState(0);

  const activeVideoStreamRef = useRef<MediaStream | null>(null);

  const {
    client,
    connect,
    connected,
    connectionStatus,
    disconnect,
    volume,
    authorizationExpired,
  } = useLiveAPIContext();
  const disconnectRef = useRef(disconnect);
  disconnectRef.current = disconnect;
  const isUserSpeaking = inputVolume > 0.1;
  useEffect(() => {
    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      if (cancelled) return;
      void connect().catch((error) => {
        if (cancelled) return;
        onError(error instanceof Error ? error : new Error(String(error)));
      });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [connect, onError]);

  useEffect(() => {
    activeVideoStreamRef.current = activeVideoStream;
  }, [activeVideoStream]);

  useEffect(() => {
    const handleConnectionError = () => {
      setIsSpeaking(false);
    };
    client.on('error', handleConnectionError);
    return () => {
      client.off('error', handleConnectionError);
    };
  }, [client]);

  useEffect(
    () => () => {
      stopMediaStream(activeVideoStreamRef.current);
      void disconnectRef.current();
    },
    []
  );

  const { activities, notes, decide, calendarResult } = useLiveTools(wsId);
  const { entries, sendText } = useLiveJournal();
  const { addVisualization } = useVisualizationStore();

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
    client.on('interrupted', handleTurnComplete);

    return () => {
      client.off('transcription', handleTranscription);
      client.off('content', handleContent);
      client.off('audio', handleAudio);
      client.off('turncomplete', handleTurnComplete);
      client.off('interrupted', handleTurnComplete);
    };
  }, [client]);

  return (
    <LiveWorkspace
      connected={connected}
      authorizationExpired={authorizationExpired}
      speaking={isSpeaking || volume > 0.03}
      listening={isUserSpeaking}
      entries={entries}
      activities={activities}
      notes={notes}
      decide={decide}
      onPrompt={sendText}
      status={
        <StatusPill
          connected={connected}
          connectionStatus={connectionStatus}
          isUserSpeaking={isUserSpeaking}
          isSpeaking={isSpeaking || volume > 0.03}
        />
      }
      results={
        <>
          <LiveCalendarResult result={calendarResult} />
          <VisualizationContainer wsId={wsId} />
        </>
      }
      controls={
        <>
          <ControlTray
            onError={onError}
            onRestartSession={onRestartSession}
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
                onSubmit={async (text: string) => sendText(text)}
              />
            )}
          </AnimatePresence>
        </>
      }
    >
      <VideoPreview
        stream={activeVideoStream}
        type={videoType}
        onClose={() => {
          setActiveVideoStream(null);
          setVideoType(null);
          setVideoStopRequest((request) => request + 1);
        }}
      />
      <video ref={videoRef} autoPlay playsInline muted className="hidden" />
    </LiveWorkspace>
  );
}
