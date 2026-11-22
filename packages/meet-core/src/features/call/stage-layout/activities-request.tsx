'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

interface ActivitiesRequest {
  /** Changes each time something asks the Activities dialog to open. */
  count: number;
  request: () => void;
}

const ActivitiesRequestContext = createContext<ActivitiesRequest | null>(null);

/**
 * Lets the stage ask the call's Activities dialog to open without owning its
 * state. The dialog belongs to the dock; it opens when the count changes.
 */
export function ActivitiesRequestProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [count, setCount] = useState(0);
  const request = useCallback(() => setCount((value) => value + 1), []);
  const value = useMemo(() => ({ count, request }), [count, request]);
  return (
    <ActivitiesRequestContext.Provider value={value}>
      {children}
    </ActivitiesRequestContext.Provider>
  );
}

export const useActivitiesRequest = () => useContext(ActivitiesRequestContext);
