'use client';

import { createContext, useContext } from 'react';

export type MeetToolContextValue = {
  meetingId: string;
  accountId: string;
  /** Anonymous guests may vote in polls; account-only tools show a sign-in state. */
  requiresAccount: boolean;
  /** Host or co-host: may start and run activities for the room. */
  canManage: boolean;
  /** False when the call is not live; tools must not query the room then. */
  enabled: boolean;
  /** This person's id in the room, which room-shared tools record as the author. */
  selfUserId?: string | null;
  /** People in the room by room id, so shared tools can show names. */
  people?: Readonly<Record<string, { displayName?: string } | undefined>>;
  close: () => void;
};

const MeetToolContext = createContext<MeetToolContextValue | null>(null);

export const MeetToolProvider = MeetToolContext.Provider;

export function useMeetTool(): MeetToolContextValue {
  const value = useContext(MeetToolContext);
  if (!value) throw new Error('useMeetTool must be used inside the tools hub');
  return value;
}
