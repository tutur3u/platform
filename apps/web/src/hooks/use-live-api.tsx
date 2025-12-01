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
import { taskTools } from '@/app/[locale]/(dashboard)/[wsId]/(dashboard)/assistant/tools/task-tools';
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

export type UseLiveAPIResults = {
  client: MultimodalLiveClient;
  setConfig: (config: LiveConfig) => void;
  config: LiveConfig;
  connected: boolean;
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
  const [config, setConfig] = useState<LiveConfig>({
    model: 'gemini-2.5-flash-native-audio-preview-09-2025',
    systemInstruction: {
      parts: [
        {
          text: `You are the user's personal assistant. The user has explicitly granted you permission to manage their tasks. You are connected to the user's task database via secure tools.

You are fully authenticated and have permission to access the user's tasks.
When the user asks "What are my tasks?" or similar, you MUST call the 'get_my_tasks' function.
Do not assume you don't have access. You DO have access.

- When users ask about their tasks, you MUST use the task management tools (get_my_tasks, search_tasks, etc.).
- When users ask general questions or for information you don't know, use the Google Search tool.
- You can combine tools to solve complex requests.

Task Tools:
- Use get_my_tasks to retrieve the user's tasks
- Use search_tasks to find specific tasks by keywords
- Use create_task to create new tasks
- Use update_task to modify existing tasks
- Use delete_task to remove tasks
- Use get_task_details to get detailed information about a specific task

Never say you don't have access to task data - always call the appropriate tool first.`,
        },
      ],
    },
    tools: taskTools,
    toolConfig: {
      functionCallingConfig: {
        mode: 'AUTO',
      },
    },
  });
  const [volume, setVolume] = useState(0);

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
    };

    const onAudio = (data: ArrayBuffer) =>
      audioStreamerRef.current?.addPCM16(new Uint8Array(data));

    client
      .on('close', onClose)
      .on('interrupted', stopAudioStreamer)
      .on('audio', onAudio);

    return () => {
      client
        .off('close', onClose)
        .off('interrupted', stopAudioStreamer)
        .off('audio', onAudio);
    };
  }, [client]);

  const connect = useCallback(async () => {
    if (!config) {
      throw new Error('config has not been set');
    }
    // Ensure any existing session is fully closed before reconnecting
    if (client.ws) {
      client.disconnect();
      // Wait a bit for the session to fully close
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    await client.connect(config);
    setConnected(true);
  }, [client, config]);

  const disconnect = useCallback(async () => {
    // Proactively stop any ongoing assistant audio before disconnecting
    audioStreamerRef.current?.stop();
    client.disconnect();
    setConnected(false);
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
    connect,
    disconnect,
    volume,
    sendToolResponse,
    onToolCall,
  };
}
