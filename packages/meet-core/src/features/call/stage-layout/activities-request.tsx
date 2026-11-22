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
  /** A menu that can open the dialog is on screen, so asking is worthwhile. */
  available: boolean;
  /** A menu announces itself while it renders; the result forgets it. */
  register: () => () => void;
}

const ActivitiesRequestContext = createContext<ActivitiesRequest | null>(null);

/**
 * Lets the stage ask the call's Activities dialog to open without owning its
 * state. The dialog belongs to the dock; it opens when the count changes, and
 * only while a menu that can show it is on screen.
 */
export function ActivitiesRequestProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [count, setCount] = useState(0);
  const [menus, setMenus] = useState(0);
  const request = useCallback(() => setCount((value) => value + 1), []);
  const register = useCallback(() => {
    setMenus((value) => value + 1);
    return () => setMenus((value) => value - 1);
  }, []);
  const value = useMemo(
    () => ({ count, request, available: menus > 0, register }),
    [count, request, menus, register]
  );
  return (
    <ActivitiesRequestContext.Provider value={value}>
      {children}
    </ActivitiesRequestContext.Provider>
  );
}

export const useActivitiesRequest = () => useContext(ActivitiesRequestContext);
