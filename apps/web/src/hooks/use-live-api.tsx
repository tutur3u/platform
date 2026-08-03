'use client';

import type { UsageMetadata } from '@google/genai';
import {
  type GeminiLiveUsageSnapshot,
  reportLiveUsage,
} from '@tuturuuu/internal-api';
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
  EMPTY_GEMINI_LIVE_USAGE,
  normalizeGeminiLiveUsage,
} from '@/lib/live/usage';

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
  authorizationExpiresAt?: string;
  children: ReactNode;
  url?: string; // Deprecated - no longer needed with new SDK
  apiKey: string;
  liveSessionId?: string;
  wsId: string;
  scopeKey: string;
  onAuthorizationExpired?: () => void;
};

export const LiveAPIProvider: FC<LiveAPIProviderProps> = ({
  apiKey,
  authorizationExpiresAt,
  liveSessionId,
  wsId,
  scopeKey,
  onAuthorizationExpired,
  children,
}) => {
  const liveAPI = useLiveAPI({ apiKey, liveSessionId, wsId, scopeKey });

  useEffect(() => {
    if (!authorizationExpiresAt) return;
    const remainingMs = new Date(authorizationExpiresAt).getTime() - Date.now();
    const timeoutId = window.setTimeout(
      () => {
        void liveAPI.disconnect().finally(() => onAuthorizationExpired?.());
      },
      Math.max(0, remainingMs)
    );
    return () => window.clearTimeout(timeoutId);
  }, [authorizationExpiresAt, liveAPI.disconnect, onAuthorizationExpired]);

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

export function useLiveAPI({
  apiKey,
  liveSessionId,
  wsId,
  scopeKey,
}: {
  apiKey: string;
  liveSessionId?: string;
  wsId: string;
  scopeKey: string;
}): UseLiveAPIResults {
  const client = useMemo(() => new MultimodalLiveClient({ apiKey }), [apiKey]);
  const audioStreamerRef = useRef<AudioStreamer | null>(null);
  const latestUsageRef = useRef<GeminiLiveUsageSnapshot>(
    EMPTY_GEMINI_LIVE_USAGE
  );
  const latestMetadataRef = useRef<UsageMetadata | null>(null);
  const searchQueriesRef = useRef(0);
  const usageSequenceRef = useRef(0);
  const usageQueueRef = useRef(Promise.resolve());
  const closingUsageRef = useRef(false);
  const hasStartedRef = useRef(false);
  const disconnectRef = useRef<() => Promise<void>>(async () => {});

  const [connected, setConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>('disconnected');
  const [config, setConfig] = useState<LiveConfig>({
    model: 'gemini-3.1-flash-live-preview',
    // NOTE: When using ephemeral tokens, systemInstruction, tools, and toolConfig
    // are embedded in the token itself. Passing them here can cause conflicts.
    // Leave config minimal to avoid overriding token settings.
  });
  const [volume, setVolume] = useState(0);

  // Workspace ID for session storage - passed as prop from the page component
  const wsIdRef = useRef<string>(wsId);
  useEffect(() => {
    wsIdRef.current = wsId;
  }, [wsId]);

  const scopeKeyRef = useRef<string>(scopeKey);
  useEffect(() => {
    scopeKeyRef.current = scopeKey;
    latestSessionHandleRef.current = null;
  }, [scopeKey]);

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

  // Track the latest session handle for reconnection
  const latestSessionHandleRef = useRef<string | null>(null);
  // Track if we're intentionally disconnecting (vs unexpected close)
  const isIntentionalDisconnectRef = useRef(false);
  // Track reconnection attempts
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 3;

  const enqueueUsageReport = useCallback(
    (close = false) => {
      if (!liveSessionId) return Promise.resolve();
      if (close && closingUsageRef.current) return usageQueueRef.current;
      if (close) closingUsageRef.current = true;

      const usage = latestMetadataRef.current
        ? normalizeGeminiLiveUsage(
            latestMetadataRef.current,
            searchQueriesRef.current
          )
        : {
            ...latestUsageRef.current,
            searchQueries: searchQueriesRef.current,
          };
      latestUsageRef.current = usage;
      const sequence = usageSequenceRef.current++;

      usageQueueRef.current = usageQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          const result = await reportLiveUsage(
            { close, liveSessionId, sequence, usage },
            { keepalive: close }
          );
          if (!close && result.remainingReservedCredits < 250) {
            void disconnectRef.current();
          }
        })
        .catch((error) => {
          console.warn('[Live API] Failed to report usage:', error);
        });

      return usageQueueRef.current;
    },
    [liveSessionId]
  );

  useEffect(() => {
    const stopAudioStreamer = () => audioStreamerRef.current?.stop();

    const onClose = async () => {
      // Ensure any ongoing assistant audio is stopped when the socket closes
      stopAudioStreamer();
      setConnected(false);

      // If this was an intentional disconnect, don't attempt reconnection
      if (isIntentionalDisconnectRef.current) {
        setConnectionStatus('disconnected');
        isIntentionalDisconnectRef.current = false;
        reconnectAttemptsRef.current = 0;
        return;
      }

      // Check if we have a session handle and should attempt reconnection
      const sessionHandle = latestSessionHandleRef.current;
      if (
        sessionHandle &&
        reconnectAttemptsRef.current < maxReconnectAttempts
      ) {
        console.log(
          `[Live API] Connection closed unexpectedly, attempting reconnection (attempt ${reconnectAttemptsRef.current + 1}/${maxReconnectAttempts})`
        );
        setConnectionStatus('reconnecting');
        reconnectAttemptsRef.current++;

        // Wait a bit before reconnecting to avoid rapid reconnection loops
        await new Promise((resolve) =>
          setTimeout(resolve, 1000 * reconnectAttemptsRef.current)
        );

        try {
          await client.connect({
            ...config,
            sessionResumption: { handle: sessionHandle },
          });
          console.log('[Live API] Reconnected successfully');
          setConnected(true);
          setConnectionStatus('connected');
          reconnectAttemptsRef.current = 0;
        } catch (error) {
          console.error('[Live API] Reconnection failed:', error);
          if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
            console.error('[Live API] Max reconnection attempts reached');
            setConnectionStatus('disconnected');
            reconnectAttemptsRef.current = 0;
          }
        }
      } else {
        setConnectionStatus('disconnected');
        reconnectAttemptsRef.current = 0;
      }
    };

    const onAudio = (data: ArrayBuffer) =>
      audioStreamerRef.current?.addPCM16(new Uint8Array(data));

    // When the turn completes, flush any remaining audio in the processing buffer
    // This ensures the last chunk of audio (which may be smaller than bufferSize) is played
    const onTurnComplete = () => audioStreamerRef.current?.complete();

    const onUsage = (metadata: UsageMetadata) => {
      latestMetadataRef.current = metadata;
      latestUsageRef.current = normalizeGeminiLiveUsage(
        metadata,
        searchQueriesRef.current
      );
      void enqueueUsageReport();
    };

    const onGroundingMetadata = (metadata: { webSearchQueries?: string[] }) => {
      searchQueriesRef.current += metadata.webSearchQueries?.length ?? 0;
    };

    // Handle session resumption updates - store handle for reconnection
    // This is sent periodically and before session ends to allow resumption
    const onSessionResumptionUpdate = async (data: {
      resumable: boolean;
      newHandle?: string;
    }) => {
      if (data.resumable && data.newHandle) {
        console.log(
          '[Live API] Session resumption update received, storing handle for potential reconnection'
        );
        // Store in ref for immediate access during reconnection
        latestSessionHandleRef.current = data.newHandle;

        // Also persist to server for cross-session recovery
        if (wsIdRef.current) {
          try {
            await fetch('/api/v1/live/session', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                sessionHandle: data.newHandle,
                wsId: wsIdRef.current,
                scopeKey: scopeKeyRef.current,
              }),
            });
          } catch (error) {
            console.warn('[Live API] Failed to store session handle:', error);
          }
        }
      }
    };

    client
      .on('close', onClose)
      .on('interrupted', stopAudioStreamer)
      .on('audio', onAudio)
      .on('usage', onUsage)
      .on('groundingmetadata', onGroundingMetadata)
      .on('turncomplete', onTurnComplete)
      .on('sessionresumptionupdate', onSessionResumptionUpdate);

    return () => {
      client
        .off('close', onClose)
        .off('interrupted', stopAudioStreamer)
        .off('audio', onAudio)
        .off('usage', onUsage)
        .off('groundingmetadata', onGroundingMetadata)
        .off('turncomplete', onTurnComplete)
        .off('sessionresumptionupdate', onSessionResumptionUpdate);
    };
  }, [client, config, enqueueUsageReport]);

  const connect = useCallback(async () => {
    if (!config) {
      throw new Error('config has not been set');
    }

    // Reset intentional disconnect flag since we're connecting
    hasStartedRef.current = true;
    isIntentionalDisconnectRef.current = false;
    setConnectionStatus('connecting');

    // First check the in-memory ref for a session handle (faster for reconnection)
    let storedHandle = latestSessionHandleRef.current;

    // If no in-memory handle, try to fetch from server storage
    if (!storedHandle && wsIdRef.current) {
      try {
        const sessionQuery = new URLSearchParams({
          wsId: wsIdRef.current,
          scopeKey: scopeKeyRef.current,
        });
        const res = await fetch(`/api/v1/live/session?${sessionQuery}`);
        const data = await res.json();
        storedHandle = data.sessionHandle || null;
        if (storedHandle) {
          latestSessionHandleRef.current = storedHandle;
          console.log(
            '[Live API] Found stored session handle, will attempt resumption'
          );
          setConnectionStatus('reconnecting');
        }
      } catch (error) {
        console.warn('[Live API] Failed to fetch session handle:', error);
      }
    } else if (storedHandle) {
      console.log('[Live API] Using in-memory session handle for reconnection');
      setConnectionStatus('reconnecting');
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
      await client.connect({
        ...config,
        ...(storedHandle == null
          ? {}
          : { sessionResumption: { handle: storedHandle } }),
      });
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
    // Mark this as an intentional disconnect to prevent auto-reconnection
    isIntentionalDisconnectRef.current = true;
    // Proactively stop any ongoing assistant audio before disconnecting
    audioStreamerRef.current?.stop();
    if (hasStartedRef.current) {
      await enqueueUsageReport(true);
      hasStartedRef.current = false;
    }
    client.disconnect();
    setConnected(false);
    setConnectionStatus('disconnected');
    // Clear the session handle since we're intentionally disconnecting
    latestSessionHandleRef.current = null;

    // Clear server-side session handle as well
    if (wsIdRef.current) {
      try {
        const sessionQuery = new URLSearchParams({
          wsId: wsIdRef.current,
          scopeKey: scopeKeyRef.current,
        });
        await fetch(`/api/v1/live/session?${sessionQuery}`, {
          method: 'DELETE',
        });
      } catch (error) {
        console.warn('[Live API] Failed to delete session handle:', error);
      }
    }
  }, [client, enqueueUsageReport]);
  disconnectRef.current = disconnect;

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
