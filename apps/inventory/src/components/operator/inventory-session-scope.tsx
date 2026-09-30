'use client';
import { createContext, type ReactNode, useContext } from 'react';
const InventoryActorContext = createContext('');
export function InventorySessionScope({
  actorId,
  children,
}: {
  actorId: string;
  children: ReactNode;
}) {
  return (
    <InventoryActorContext.Provider value={actorId}>
      {children}
    </InventoryActorContext.Provider>
  );
}
export const useInventoryActor = () => useContext(InventoryActorContext);
