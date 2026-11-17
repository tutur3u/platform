'use client';

import { createContext, type ReactNode, useContext } from 'react';
import type { ComposeInitialDraft } from './mail-composer-types';
import {
  type MailProfileMailbox,
  MailProfileMailboxProvider,
} from './mail-profile-context';

export type StartMailTo = (address: string, name: string | null) => void;

const MailComposeContext = createContext<StartMailTo | null>(null);

/**
 * Lets profile cards start a new message and see the open mailbox without
 * prop drilling.
 */
export function MailComposeProvider({
  openCompose,
  mailbox,
  children,
}: {
  openCompose: (draft: ComposeInitialDraft) => unknown;
  mailbox?: MailProfileMailbox | null;
  children: ReactNode;
}) {
  const startMailTo: StartMailTo = (address, name) =>
    void openCompose({
      to: [address],
      recipientDisplayNames: name ? { [address]: name } : undefined,
    });
  return (
    <MailComposeContext.Provider value={startMailTo}>
      <MailProfileMailboxProvider mailbox={mailbox}>
        {children}
      </MailProfileMailboxProvider>
    </MailComposeContext.Provider>
  );
}

/** Returns null outside the mail client, where composing is unavailable. */
export function useStartMailTo() {
  return useContext(MailComposeContext);
}
