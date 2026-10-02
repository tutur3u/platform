'use client';
import { createContext, type ReactNode, useContext } from 'react';

const MailActorContext = createContext<string | null>(null);
/** Actor comes from the existing authenticated server layout, never a request body. */
export function MailActorProvider({
  actorId,
  children,
}: {
  actorId: string;
  children?: ReactNode;
}) {
  return (
    <MailActorContext.Provider key={actorId} value={actorId}>
      {children}
    </MailActorContext.Provider>
  );
}
export function useMailActor() {
  return useContext(MailActorContext);
}
