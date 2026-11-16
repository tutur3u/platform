'use client';

import { parseAsString, useQueryState } from 'nuqs';
import { createContext, type ReactNode, useContext } from 'react';

const ConnectedByDefault = createContext(false);

/** The server layout decides the default source; `?connected=` overrides it. */
export function MailSourceProvider({
  children,
  connectedByDefault,
}: {
  children: ReactNode;
  connectedByDefault: boolean;
}) {
  return (
    <ConnectedByDefault.Provider value={connectedByDefault}>
      {children}
    </ConnectedByDefault.Provider>
  );
}

export function useConnectedByDefault() {
  return useContext(ConnectedByDefault);
}

/** Source from `?connected=`, and the requested connected account from `?account=`. */
export function useMailSource() {
  const connectedByDefault = useConnectedByDefault();
  const [connected] = useQueryState(
    'connected',
    parseAsString.withDefault(connectedByDefault ? '1' : '')
  );
  const [accountId] = useQueryState('account');
  return {
    accountId,
    source: connected ? ('connected' as const) : ('managed' as const),
  };
}
