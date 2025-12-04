'use client';

import { AudioStreamer } from '@/app/[locale]/(dashboard)/[wsId]/(dashboard)/assistant/audio/audio-streamer';
import { MultimodalLiveClient } from '@/app/[locale]/(dashboard)/[wsId]/(dashboard)/assistant/audio/multimodal-live-client';
import { audioContext } from '@/app/[locale]/(dashboard)/[wsId]/(dashboard)/assistant/audio/utils';
import VolMeterWorket from '@/app/[locale]/(dashboard)/[wsId]/(dashboard)/assistant/audio/worklets/vol-meter';
import type {
  LiveConfig,
  ToolCall,
  ToolResponse,
} from '@/app/[locale]/(dashboard)/[wsId]/(dashboard)/assistant/multimodal-live';
import {
  createContext,
  type FC,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting';

export type UseLiveAPIResults = {
  client: MultimodalLiveClient;
  setConfig: (config: LiveConfig) => void;
  config: LiveConfig;
  connected: boolean;
  connectionStatus: ConnectionStatus;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  volume: number;
  sendToolResponse: (toolResponse: ToolResponse) => void;
  onToolCall: (callback: (toolCall: ToolCall) => void) => () => void;
};

const LiveAPIContext = createContext<UseLiveAPIResults | undefined>(undefined);

export type LiveAPIProviderProps = {
  children: ReactNode;
  url?: string; // Deprecated - no longer needed with new SDK
  apiKey: string;
};

export const LiveAPIProvider: FC<LiveAPIProviderProps> = ({
  apiKey,
  children,
}) => {
  const liveAPI = useLiveAPI({ apiKey });

  return (
    <LiveAPIContext.Provider value={liveAPI}>
      {children}
    </LiveAPIContext.Provider>
  );
};

export const useLiveAPIContext = () => {
  const context = useContext(LiveAPIContext);
  if (!context) {
    throw new Error('useLiveAPIContext must be used wihin a LiveAPIProvider');
  }
  return context;
};

export function useLiveAPI({ apiKey }: { apiKey: string }): UseLiveAPIResults {
  const client = useMemo(() => new MultimodalLiveClient({ apiKey }), [apiKey]);
  const audioStreamerRef = useRef<AudioStreamer | null>(null);

  const [connected, setConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>('disconnected');
  const [config, setConfig] = useState<LiveConfig>({
    // Use gemini-2.0-flash-live for multimodal support (audio + video)
    // Note: gemini-2.5-flash-native-audio-preview is audio-only
    model: 'gemini-2.5-flash-native-audio-preview-09-2025',
    // NOTE: When using ephemeral tokens, systemInstruction, tools, and toolConfig
    // are embedded in the token itself. Passing them here can cause conflicts.
    // Leave config minimal to avoid overriding token settings.
  });
  const [volume, setVolume] = useState(0);

  // Get workspace ID from URL for session storage
  // This is safe because the hook is only used in workspace-scoped pages
  const wsIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Extract wsId from URL path: /[locale]/[wsId]/...
      const pathParts = window.location.pathname.split('/');
      // Path format: /en/[wsId]/... or /vi/[wsId]/...
      if (pathParts.length >= 3) {
        wsIdRef.current = pathParts[2] || null;
      }
    }
  }, []);

  // register audio for streaming server -> speakers
  useEffect(() => {
    if (!audioStreamerRef.current) {
      audioContext({ id: 'audio-out' }).then((audioCtx: AudioContext) => {
        audioStreamerRef.current = new AudioStreamer(audioCtx);
        audioStreamerRef.current
          .addWorklet<any>('vumeter-out', VolMeterWorket, (ev: any) => {
            setVolume(ev.data.volume);
          })
          .then(() => {
            // Successfully added worklet
          });
      });
    }
  }, []);

  useEffect(() => {
    const stopAudioStreamer = () => audioStreamerRef.current?.stop();

    const onClose = () => {
      // Ensure any ongoing assistant audio is stopped when the socket closes
      stopAudioStreamer();
      setConnected(false);
      setConnectionStatus('disconnected');
    };

    const onAudio = (data: ArrayBuffer) =>
      audioStreamerRef.current?.addPCM16(new Uint8Array(data));

    // When the turn completes, flush any remaining audio in the processing buffer
    // This ensures the last chunk of audio (which may be smaller than bufferSize) is played
    const onTurnComplete = () => audioStreamerRef.current?.complete();

    // Handle session resumption updates - store handle for reconnection
    const onSessionResumptionUpdate = async (data: {
      resumable: boolean;
      newHandle?: string;
    }) => {
      if (data.resumable && data.newHandle && wsIdRef.current) {
        console.log(
          '[Live API] Session resumption update received, storing handle'
        );
        try {
          await fetch('/api/v1/live/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionHandle: data.newHandle,
              wsId: wsIdRef.current,
            }),
          });
        } catch (error) {
          console.warn('[Live API] Failed to store session handle:', error);
        }
      }
    };

    client
      .on('close', onClose)
      .on('interrupted', stopAudioStreamer)
      .on('audio', onAudio)
      .on('turncomplete', onTurnComplete)
      .on('sessionresumptionupdate', onSessionResumptionUpdate);

    return () => {
      client
        .off('close', onClose)
        .off('interrupted', stopAudioStreamer)
        .off('audio', onAudio)
        .off('turncomplete', onTurnComplete)
        .off('sessionresumptionupdate', onSessionResumptionUpdate);
    };
  }, [client]);

  const connect = useCallback(async () => {
    if (!config) {
      throw new Error('config has not been set');
    }

    setConnectionStatus('connecting');

    // Try to fetch stored session handle for resumption
    let storedHandle: string | null = null;
    if (wsIdRef.current) {
      try {
        const res = await fetch(`/api/v1/live/session?wsId=${wsIdRef.current}`);
        const data = await res.json();
        storedHandle = data.sessionHandle || null;
        if (storedHandle) {
          console.log(
            '[Live API] Found stored session handle, will attempt resumption'
          );
          setConnectionStatus('reconnecting');
        }
      } catch (error) {
        console.warn('[Live API] Failed to fetch session handle:', error);
      }
    }

    console.log('[Live API] Connecting with config:', {
      model: config.model,
      hasSystemInstruction: !!config.systemInstruction,
      hasTools: !!config.tools,
      toolCount: config.tools?.length,
      hasToolConfig: !!config.toolConfig,
      hasStoredHandle: !!storedHandle,
    });

    // Ensure any existing session is fully closed before reconnecting
    if (client.ws) {
      client.disconnect();
      // Wait a bit for the session to fully close
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    try {
      await client.connect(config);
      console.log('[Live API] Connected successfully');
      setConnected(true);
      setConnectionStatus('connected');
    } catch (error) {
      console.error('[Live API] Connection failed:', error);
      setConnectionStatus('disconnected');
      throw error;
    }
  }, [client, config]);

  const disconnect = useCallback(async () => {
    // Proactively stop any ongoing assistant audio before disconnecting
    audioStreamerRef.current?.stop();
    client.disconnect();
    setConnected(false);
    setConnectionStatus('disconnected');
  }, [client]);

  const sendToolResponse = useCallback(
    (toolResponse: ToolResponse) => {
      client.sendToolResponse(toolResponse);
    },
    [client]
  );

  const onToolCall = useCallback(
    (callback: (toolCall: ToolCall) => void) => {
      client.on('toolcall', callback);
      return () => {
        client.off('toolcall', callback);
      };
    },
    [client]
  );

  return {
    client,
    config,
    setConfig,
    connected,
    connectionStatus,
    connect,
    disconnect,
    volume,
    sendToolResponse,
    onToolCall,
  };
}
