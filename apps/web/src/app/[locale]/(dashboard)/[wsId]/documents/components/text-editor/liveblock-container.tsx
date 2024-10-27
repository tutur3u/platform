'use client';

import { CollaborativeEditor } from './liveblock-colab-editor';
import {
  ClientSideSuspense,
  LiveblocksProvider,
  RoomProvider,
} from '@liveblocks/react';

export default function LiveblockContainer() {
  if (!process.env.NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_API_KEY)
    return <div>Missing Liveblocks public API key.</div>;

  return (
    <LiveblocksProvider
      publicApiKey={process.env.NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_API_KEY}
    >
      <RoomProvider id="my-room">
        <ClientSideSuspense fallback={<div>Loading…</div>}>
          <CollaborativeEditor />
        </ClientSideSuspense>
      </RoomProvider>
    </LiveblocksProvider>
  );
}
