'use client';

import { CollaborativeEditor } from './liveblock-colab-editor';
import {
  ClientSideSuspense,
  LiveblocksProvider,
  RoomProvider,
} from '@liveblocks/react/suspense';
import process from 'process';

export default function App() {
  return (
    <LiveblocksProvider
      publicApiKey={process.env.LIVEBLOCKS_PUBLIC_API_KEY || 'pk_live_...'} // API key must be provided in .env.local
    >
      <RoomProvider id="my-room">
        <ClientSideSuspense fallback={<div>Loading…</div>}>
          <CollaborativeEditor />
        </ClientSideSuspense>
      </RoomProvider>
    </LiveblocksProvider>
  );
}
