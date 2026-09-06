'use client';

import type { UsageMetadata } from '@google/genai';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  deleteLiveSessionHandle,
  type GeminiLiveUsageSnapshot,
  readLiveSessionHandle,
  reportLiveUsage,
  storeLiveSessionHandle,
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
  authorizationExpired?: boolean;
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
  model?: string;
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
  model,
}) => {
  const [authorizationExpired, setAuthorizationExpired] = useState(false);
  const liveAPI = useLiveAPI({ apiKey, liveSessionId, wsId, scopeKey, model });

  useEffect(() => {
    if (!authorizationExpiresAt) return;
    const remainingMs = new Date(authorizationExpiresAt).getTime() - Date.now();
    const timeoutId = window.setTimeout(
      () => {
        setAuthorizationExpired(true);
        void liveAPI.disconnect().finally(() => onAuthorizationExpired?.());
      },
      Math.max(0, remainingMs)
    );
    return () => window.clearTimeout(timeoutId);
  }, [authorizationExpiresAt, liveAPI.disconnect, onAuthorizationExpired]);

  return (
    <LiveAPIContext.Provider value={{ ...liveAPI, authorizationExpired }}>
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
  model = 'gemini-3.1-flash-live-preview',
}: {
  model?: string;
  apiKey: string;
  liveSessionId?: string;
  wsId: string;
  scopeKey: string;
}): UseLiveAPIResults {
  const queryClient = useQueryClient();
  const { mutateAsync: persistHandle } = useMutation({
    mutationFn: (scope: Parameters<typeof storeLiveSessionHandle>[0]) =>
      storeLiveSessionHandle(scope),
  });
  const { mutateAsync: deleteHandle } = useMutation({
    mutationFn: (scope: Parameters<typeof deleteLiveSessionHandle>[0]) =>
      deleteLiveSessionHandle(scope),
  });
  const lifecycleRef = useRef(0);
  const recoveringRef = useRef(false);
  const connectingRef = useRef<Promise<void> | null>(null);
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
    model,
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
    let disposed = false;
    if (!audioStreamerRef.current) {
      audioContext({ id: 'audio-out' }).then((audioCtx: AudioContext) => {
        if (disposed) return;
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
    return () => {
      disposed = true;
      audioStreamerRef.current?.stop();
    };
  }, []);

  // Track the latest session handle for reconnection
  const latestSessionHandleRef = useRef<string | null>(null);
  // Track if we're intentionally disconnecting (vs unexpected close)
  const isIntentionalDisconnectRef = useRef(false);
  // Track reconnection attempts
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
      stopAudioStreamer();
      setConnected(false);
      if (isIntentionalDisconnectRef.current) {
        setConnectionStatus('disconnected');
        return;
      }
      if (recoveringRef.current || connectingRef.current) return;
      const generation = lifecycleRef.current;
      const sessionHandle = latestSessionHandleRef.current;
      if (!sessionHandle) {
        setConnectionStatus('disconnected');
        return;
      }
      recoveringRef.current = true;
      setConnectionStatus('reconnecting');
      try {
        for (let attempt = 1; attempt <= maxReconnectAttempts; attempt++) {
          await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
          if (
            generation !== lifecycleRef.current ||
            isIntentionalDisconnectRef.current
          )
            return;
          try {
            await client.connect({
              ...config,
              sessionResumption: { handle: sessionHandle },
            });
            if (generation !== lifecycleRef.current) {
              client.disconnect();
              return;
            }
            setConnected(true);
            setConnectionStatus('connected');
            return;
          } catch {
            // A bounded loop also retries failures that do not emit a close event.
          }
        }
        setConnectionStatus('disconnected');
      } finally {
        recoveringRef.current = false;
      }
    };

    let goAwayTimer: ReturnType<typeof setTimeout> | undefined;
    const onGoAway = ({ timeLeft }: { timeLeft?: string }) => {
      if (goAwayTimer) clearTimeout(goAwayTimer);
      const seconds = Number.parseFloat(timeLeft ?? '1');
      goAwayTimer = setTimeout(
        () => {
          if (
            isIntentionalDisconnectRef.current ||
            recoveringRef.current ||
            !latestSessionHandleRef.current
          )
            return;
          client.disconnect();
          void onClose();
        },
        Number.isFinite(seconds)
          ? Math.max(0, Math.min(30000, (seconds - 1) * 1000))
          : 0
      );
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
      if (!data.resumable) latestSessionHandleRef.current = null;
      if (data.resumable && data.newHandle) {
        console.log(
          '[Live API] Session resumption update received, storing handle for potential reconnection'
        );
        // Store in ref for immediate access during reconnection
        latestSessionHandleRef.current = data.newHandle;

        if (wsIdRef.current && !liveSessionId) {
          void persistHandle({
            sessionHandle: data.newHandle,
            wsId: wsIdRef.current,
            scopeKey: scopeKeyRef.current,
          }).catch(() => {
            console.warn('[Live API] Failed to store session handle');
          });
        }
      }
    };

    client
      .on('close', onClose)
      .on('goaway', onGoAway)
      .on('interrupted', stopAudioStreamer)
      .on('audio', onAudio)
      .on('usage', onUsage)
      .on('groundingmetadata', onGroundingMetadata)
      .on('turncomplete', onTurnComplete)
      .on('sessionresumptionupdate', onSessionResumptionUpdate);

    return () => {
      if (goAwayTimer) clearTimeout(goAwayTimer);
      client
        .off('close', onClose)
        .off('goaway', onGoAway)
        .off('interrupted', stopAudioStreamer)
        .off('audio', onAudio)
        .off('usage', onUsage)
        .off('groundingmetadata', onGroundingMetadata)
        .off('turncomplete', onTurnComplete)
        .off('sessionresumptionupdate', onSessionResumptionUpdate);
    };
  }, [client, config, enqueueUsageReport, liveSessionId, persistHandle]);

  const connect = useCallback(() => {
    if (connectingRef.current) return connectingRef.current;
    if (client.ws) return Promise.resolve();
    const generation = ++lifecycleRef.current;
    isIntentionalDisconnectRef.current = false;
    hasStartedRef.current = true;
    closingUsageRef.current = false;
    setConnectionStatus('connecting');
    const pending = (async () => {
      let handle = latestSessionHandleRef.current;
      // Paid dashboard sessions only resume within their current billing reservation.
      if (!handle && !liveSessionId) {
        try {
          const stored = await queryClient.fetchQuery({
            queryKey: ['live-session-handle', wsId, scopeKey],
            queryFn: () => readLiveSessionHandle({ wsId, scopeKey }),
            staleTime: 0,
          });
          handle = stored.sessionHandle;
        } catch {
          /* Storage failure does not prevent starting a session. */
        }
      }
      if (generation !== lifecycleRef.current) return;
      try {
        await client.connect({
          ...config,
          ...(handle ? { sessionResumption: { handle } } : {}),
        });
        if (generation !== lifecycleRef.current) {
          client.disconnect();
          return;
        }
        setConnected(true);
        setConnectionStatus('connected');
      } catch (error) {
        if (generation !== lifecycleRef.current) return;
        setConnectionStatus('disconnected');
        throw error;
      }
    })();
    connectingRef.current = pending;
    void pending
      .finally(() => {
        if (connectingRef.current === pending) connectingRef.current = null;
      })
      .catch(() => undefined);
    return pending;
  }, [client, config, liveSessionId, queryClient, scopeKey, wsId]);

  const disconnect = useCallback(async () => {
    // Mark this as an intentional disconnect to prevent auto-reconnection
    isIntentionalDisconnectRef.current = true;
    lifecycleRef.current++;
    client.disconnect();
    setConnected(false);
    setConnectionStatus('disconnected');
    // Proactively stop any ongoing assistant audio before disconnecting
    audioStreamerRef.current?.stop();
    if (hasStartedRef.current) {
      hasStartedRef.current = false;
      await enqueueUsageReport(true);
    }
    // Clear the session handle since we're intentionally disconnecting
    latestSessionHandleRef.current = null;

    try {
      await deleteHandle({
        wsId: wsIdRef.current,
        scopeKey: scopeKeyRef.current,
      });
      queryClient.removeQueries({
        queryKey: ['live-session-handle', wsIdRef.current, scopeKeyRef.current],
      });
    } catch {
      console.warn('[Live API] Failed to delete session handle');
    }
  }, [client, deleteHandle, enqueueUsageReport, queryClient]);

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
