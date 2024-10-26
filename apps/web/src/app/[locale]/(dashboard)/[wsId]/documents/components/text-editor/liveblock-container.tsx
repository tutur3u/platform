'use client';

import { Editor } from './liveblock-editor'
import {
  ClientSideSuspense,
  LiveblocksProvider,
  RoomProvider,
} from '@liveblocks/react/suspense';

export default function App() {
  return (
    <LiveblocksProvider
      publicApiKey={
        'pk_dev_ew1CU-SlltbyWvnDXtV3-TST-js7rC4pUvCT_jEjJNWeieSSi0kC6BJkl4pLaNYv'
      }
    >
      <RoomProvider id="my-room">
        <ClientSideSuspense fallback={<div>Loading…</div>}>
          <Editor />
        </ClientSideSuspense>
      </RoomProvider>
    </LiveblocksProvider>
  );
}
