'use client';

import { API_KEY_MISSING } from '../../data/strings';
import { LiveblocksProvider } from '@liveblocks/react';

const API_KEY = process.env.NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_API_KEY;

const LiveblockContainer = ({ children }: { children: React.ReactNode }) => {
  if (!API_KEY) return <div>{API_KEY_MISSING}</div>;

  return (
    <LiveblocksProvider publicApiKey={API_KEY}>{children}</LiveblocksProvider>
  );
};

export default LiveblockContainer;
