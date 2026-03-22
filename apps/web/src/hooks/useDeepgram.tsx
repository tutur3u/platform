'use client';

import type * as Deepgram from '@deepgram/sdk';
import { DeepgramClient } from '@deepgram/sdk';
import type { V1Client } from '@deepgram/sdk/listen/v1';
import {
  createContext,
  type FunctionComponent,
  type ReactNode,
  useContext,
  useState,
} from 'react';

const LiveTranscriptionEvents = {
  Close: 'close',
  Error: 'error',
  Message: 'message',
  Open: 'open',
  Transcript: 'message',
} as const;

enum LiveConnectionState {
  CLOSED = 'closed',
  CONNECTING = 'connecting',
  OPEN = 'open',
}

type LiveSchema = V1Client.ConnectArgs;
type LiveConnection = Awaited<ReturnType<V1Client['connect']>>;
type LiveTranscriptionEvent = Deepgram.listen.ListenV1Results;

interface DeepgramContextType {
  connection: LiveConnection | null;
  connectToDeepgram: (options: LiveSchema, endpoint?: string) => Promise<void>;
  disconnectFromDeepgram: () => void;
  connectionState: LiveConnectionState;
}

const DeepgramContext = createContext<DeepgramContextType | undefined>(
  undefined
);

interface DeepgramContextProviderProps {
  children: ReactNode;
}

const getApiKey = async (): Promise<string> => {
  const response = await fetch('/api/v1/infrastructure/ai/deepgram', {
    cache: 'no-store',
  });
  const result = await response.json();
  return result.key as string;
};

const DeepgramContextProvider: FunctionComponent<
  DeepgramContextProviderProps
> = ({ children }) => {
  const [connection, setConnection] = useState<LiveConnection | null>(null);
  const [connectionState, setConnectionState] = useState<LiveConnectionState>(
    LiveConnectionState.CLOSED
  );

  const connectToDeepgram = async (options: LiveSchema, endpoint?: string) => {
    if (connection) {
      connection.close();
      setConnection(null);
    }

    setConnectionState(LiveConnectionState.CONNECTING);

    const key = await getApiKey();
    const clientOptions = endpoint
      ? {
          apiKey: key,
          baseUrl: () => endpoint,
        }
      : { apiKey: key };

    const deepgram = new DeepgramClient(clientOptions);

    const conn = await deepgram.listen.v1.connect({
      ...options,
      Authorization: key,
    });

    const handleOpen = () => setConnectionState(LiveConnectionState.OPEN);
    const handleClose = () => setConnectionState(LiveConnectionState.CLOSED);

    conn.on(LiveTranscriptionEvents.Open, handleOpen);
    conn.on(LiveTranscriptionEvents.Close, handleClose);
    conn.on(LiveTranscriptionEvents.Error, handleClose);

    setConnection(conn);
    conn.connect();
    await conn.waitForOpen();
  };

  const disconnectFromDeepgram = () => {
    if (connection) {
      connection.close();
      setConnection(null);
    }

    setConnectionState(LiveConnectionState.CLOSED);
  };

  return (
    <DeepgramContext.Provider
      value={{
        connection,
        connectToDeepgram,
        disconnectFromDeepgram,
        connectionState,
      }}
    >
      {children}
    </DeepgramContext.Provider>
  );
};

function useDeepgram(): DeepgramContextType {
  const context = useContext(DeepgramContext);
  if (context === undefined) {
    throw new Error(
      'useDeepgram must be used within a DeepgramContextProvider'
    );
  }
  return context;
}

export {
  DeepgramContextProvider,
  LiveConnectionState,
  type LiveTranscriptionEvent,
  LiveTranscriptionEvents,
  useDeepgram,
};
