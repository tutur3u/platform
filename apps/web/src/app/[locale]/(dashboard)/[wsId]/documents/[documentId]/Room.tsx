'use client';

import { createRoomId } from '../apis/liveblock-room';
import { Loading } from '../components/text-editor/loading';
import { ClientSideSuspense } from '@liveblocks/react';
import { RoomProvider } from '@liveblocks/react/suspense';
import { ReactNode, useMemo } from 'react';

export function Room({
  children,
  wsID,
  documentID,
}: {
  children: ReactNode;
  wsID: string;
  documentID: string;
}) {
  const roomId = useMemo(
    () => createRoomId(wsID, documentID),
    [wsID, documentID]
  );

  return (
    <RoomProvider
      id={roomId}
      initialPresence={{
        cursor: null,
      }}
    >
      <ClientSideSuspense fallback={<Loading />}>{children}</ClientSideSuspense>
    </RoomProvider>
  );
}
