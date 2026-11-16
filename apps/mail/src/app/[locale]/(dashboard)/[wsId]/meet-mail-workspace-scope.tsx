'use client';
import { createContext, type ReactNode, useContext } from 'react';
const Scope = createContext<string | null>(null);
export function MeetMailWorkspaceScope({
  workspaceId,
  children,
}: {
  workspaceId: string;
  children: ReactNode;
}) {
  return <Scope.Provider value={workspaceId}>{children}</Scope.Provider>;
}
export function useMeetMailWorkspaceScope(fallback: string) {
  return useContext(Scope) ?? fallback;
}
