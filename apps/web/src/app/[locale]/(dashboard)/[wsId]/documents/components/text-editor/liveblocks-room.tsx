'use client';

import { createRoomId } from '../../apis/liveblock-room';
import { Loading } from './loading';
import { ClientSideSuspense, RoomProvider } from '@liveblocks/react';
import { FC, ReactNode, useMemo } from 'react';

interface LiveBlocksRoomProps {
  children: ReactNode;
  wsID: string;
  documentID: string;
}

const LiveBlocksRoom: FC<LiveBlocksRoomProps> = ({
  children,
  wsID,
  documentID,
}) => {
  const roomId = useMemo(
    () => createRoomId(wsID, documentID),
    [wsID, documentID]
  );

  return (
    <RoomProvider id={roomId} initialPresence={{ cursor: null }}>
      <ClientSideSuspense fallback={<Loading />}>{children}</ClientSideSuspense>
    </RoomProvider>
  );
};

export default LiveBlocksRoom;
