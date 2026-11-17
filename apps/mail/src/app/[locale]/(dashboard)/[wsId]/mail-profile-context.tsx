'use client';

import type { MailMailbox } from '@tuturuuu/internal-api';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useState,
} from 'react';

export type MailProfileMailbox = Pick<MailMailbox, 'id' | 'role' | 'wsId'>;

const MailboxContext = createContext<MailProfileMailbox | null>(null);

/** Gives profile cards the open mailbox, which owns blocks and Contacts. */
export function MailProfileMailboxProvider({
  mailbox,
  children,
}: {
  mailbox: MailProfileMailbox | null | undefined;
  children: ReactNode;
}) {
  return (
    <MailboxContext.Provider value={mailbox ?? null}>
      {children}
    </MailboxContext.Provider>
  );
}

/** Null outside the mail client or before the mailbox loads. */
export function useMailProfileMailbox() {
  return useContext(MailboxContext);
}

type ReportHold = (id: string, held: boolean) => void;

const HoldContext = createContext<ReportHold | null>(null);

/**
 * State for a profile card container: `held` is true while any part of the
 * card (a dirty form, an open dialog, a pending action) needs it to stay open.
 */
export function useMailProfileHoldState() {
  const [holds, setHolds] = useState<ReadonlySet<string>>(() => new Set());
  const report = useCallback<ReportHold>((id, held) => {
    setHolds((current) => {
      if (current.has(id) === held) return current;
      const next = new Set(current);
      if (held) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  return { held: holds.size > 0, report };
}

export function MailProfileHoldProvider({
  report,
  children,
}: {
  report: ReportHold;
  children: ReactNode;
}) {
  return <HoldContext.Provider value={report}>{children}</HoldContext.Provider>;
}

/** Keeps the surrounding profile card open while `active` is true. */
export function useHoldMailProfile(active: boolean) {
  const report = useContext(HoldContext);
  const id = useId();
  useEffect(() => {
    report?.(id, active);
    return () => report?.(id, false);
  }, [report, id, active]);
}
