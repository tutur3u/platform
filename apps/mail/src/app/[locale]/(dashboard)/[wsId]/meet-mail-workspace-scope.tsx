'use client';
import { createContext, type ReactNode, useContext, useState } from 'react';
import { useMailActor } from '@/components/mail-actor-provider';
const Scope = createContext<string | null>(null);
const Memory = createContext<{
  raw: string | null;
  setRaw: (value: string | null) => void;
} | null>(null);
function DraftMemory({ children }: { children: ReactNode }) {
  const [raw, setRaw] = useState<string | null>(null);
  return <Memory.Provider value={{ raw, setRaw }}>{children}</Memory.Provider>;
}
export function MeetMailWorkspaceScope({
  workspaceId,
  children,
}: {
  workspaceId: string;
  children: ReactNode;
}) {
  const actorId = useMailActor();
  return (
    <Scope.Provider value={workspaceId}>
      <DraftMemory key={`${actorId}:${workspaceId}`}>{children}</DraftMemory>
    </Scope.Provider>
  );
}
export function useMeetMailWorkspaceScope(fallback: string) {
  return useContext(Scope) ?? fallback;
}
export function useMeetMailDraftMemory() {
  const shared = useContext(Memory);
  const [raw, setRaw] = useState<string | null>(null);
  return shared ?? { raw, setRaw };
}
