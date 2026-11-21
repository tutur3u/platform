'use client';
import { createContext, type ReactNode, useContext } from 'react';

const MailActorContext = createContext<{
  actorId: string;
  canConnectAccounts: boolean;
} | null>(null);
/** Actor comes from the existing authenticated server layout, never a request body. */
export function MailActorProvider({
  actorId,
  canConnectAccounts = false,
  children,
}: {
  actorId: string;
  canConnectAccounts?: boolean;
  children?: ReactNode;
}) {
  return (
    <MailActorContext.Provider
      key={actorId}
      value={{ actorId, canConnectAccounts }}
    >
      {children}
    </MailActorContext.Provider>
  );
}
export function useMailActor() {
  return useContext(MailActorContext)?.actorId ?? null;
}

export function useCanConnectMailAccounts() {
  return useContext(MailActorContext)?.canConnectAccounts ?? false;
}
