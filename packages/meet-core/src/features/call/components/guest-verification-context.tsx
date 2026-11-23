'use client';

import { createContext, type ReactNode, useContext } from 'react';

/** What an anonymous guest's call needs to verify while waiting. */
export type GuestVerification = {
  meetingId: string;
  siteKey: string;
  /** The signed guest session already passed a human check. */
  verified: boolean;
};

const GuestVerificationContext = createContext<GuestVerification | null>(null);

export function GuestVerificationProvider({
  value,
  children,
}: {
  value: GuestVerification | null;
  children: ReactNode;
}) {
  return (
    <GuestVerificationContext.Provider value={value}>
      {children}
    </GuestVerificationContext.Provider>
  );
}

export const useGuestVerification = () => useContext(GuestVerificationContext);
