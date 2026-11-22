'use client';

import { useQuery } from '@tanstack/react-query';
import type { MailMailbox } from '@tuturuuu/internal-api';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { parseAsString, useQueryStates } from 'nuqs';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  rememberDefaultMailbox,
  resolveActiveMailboxId,
  useMailboxHint,
} from './mail-mailbox-hint';
import { isMailboxForbidden, mailOrganizationQuery } from './mail-read-query';
import { useMailSource } from './mail-source';
import { useMailBootstrap } from './use-mail-bootstrap';

const selectionParams = {
  mailbox: parseAsString,
  thread: parseAsString,
  folderId: parseAsString,
  label: parseAsString,
};

const MailboxSelectionContext = createContext<ReturnType<
  typeof useMailboxSelectionState
> | null>(null);

function useMailboxSelectionState(workspaceId: string) {
  const t = useTranslations('mail');
  const [{ mailbox: requestedId }, setSelection] =
    useQueryStates(selectionParams);
  const bootstrapQuery = useMailBootstrap(workspaceId);
  const [deniedIds, setDeniedIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const rejectedSelection = useRef<string | null>(null);
  const awaitingDiscovery = useRef(false);
  const hint = useMailboxHint(workspaceId);
  const { source } = useMailSource();
  const discovered: MailMailbox[] | undefined = bootstrapQuery.data?.mailboxes;
  const mailboxes = (discovered ?? []).filter(
    (mailbox) => !deniedIds.has(mailbox.id)
  );
  const defaultMailboxId = mailboxes.find(
    ({ status }) => status === 'active'
  )?.id;
  const selectable = mailboxes.filter(
    ({ id, status }) => id === requestedId || status === 'active'
  );
  const activeMailboxId = resolveActiveMailboxId({
    hint: hint && !deniedIds.has(hint) ? hint : null,
    mailboxes: discovered ? selectable : undefined,
    requested: requestedId && !deniedIds.has(requestedId) ? requestedId : null,
  });
  const activeMailbox = selectable.find(({ id }) => id === activeMailboxId);
  const nextMailboxId = selectable.find(
    ({ id, status }) => id !== activeMailboxId && status === 'active'
  )?.id;

  const hasDiscovery = Boolean(discovered);
  useEffect(() => {
    if (hasDiscovery) rememberDefaultMailbox(workspaceId, defaultMailboxId);
  }, [hasDiscovery, defaultMailboxId, workspaceId]);

  const selectMailbox = useCallback(
    (mailbox: string | null) =>
      setSelection({ mailbox, thread: null, folderId: null, label: null }),
    [setSelection]
  );

  const notifySwitch = useCallback(() => {
    toast.warning(t('mailbox_access_switched'), {
      id: `mailbox-access-${workspaceId}`,
    });
  }, [t, workspaceId]);

  const requestedMissing = Boolean(
    requestedId &&
    discovered &&
    !deniedIds.has(requestedId) &&
    !discovered.some(({ id }) => id === requestedId)
  );
  useEffect(() => {
    if (source !== 'managed' || !hasDiscovery) return;
    const needsFallback =
      requestedMissing || (awaitingDiscovery.current && !requestedId);
    awaitingDiscovery.current = false;
    if (!needsFallback) return;
    void selectMailbox(activeMailboxId);
    if (activeMailboxId) notifySwitch();
  }, [
    activeMailboxId,
    hasDiscovery,
    notifySwitch,
    requestedId,
    requestedMissing,
    selectMailbox,
    source,
  ]);

  const rejectMailbox = useCallback(
    (mailboxId: string) => {
      if (
        source !== 'managed' ||
        activeMailboxId !== mailboxId ||
        rejectedSelection.current === mailboxId
      )
        return;
      rejectedSelection.current = mailboxId;
      if (hint === mailboxId) rememberDefaultMailbox(workspaceId, undefined);
      setDeniedIds((ids) => new Set(ids).add(mailboxId));
      void selectMailbox(nextMailboxId ?? null);
      awaitingDiscovery.current = !hasDiscovery;
      if (nextMailboxId) notifySwitch();
    },
    [
      activeMailboxId,
      hasDiscovery,
      hint,
      nextMailboxId,
      notifySwitch,
      selectMailbox,
      source,
      workspaceId,
    ]
  );

  const organizationQuery = useQuery({
    ...mailOrganizationQuery(workspaceId, activeMailboxId ?? ''),
    enabled: source === 'managed' && Boolean(activeMailboxId),
  });
  const organizationError = organizationQuery.error;
  useEffect(() => {
    if (activeMailboxId && isMailboxForbidden(organizationError)) {
      rejectMailbox(activeMailboxId);
    }
  }, [activeMailboxId, organizationError, rejectMailbox]);

  return {
    activeMailbox,
    activeMailboxId,
    bootstrapQuery,
    mailboxes,
    organizationQuery,
    rejectMailbox,
  };
}

export function MailboxSelectionProvider({
  children,
  workspaceId,
}: {
  children?: ReactNode;
  workspaceId: string;
}) {
  const selection = useMailboxSelectionState(workspaceId);
  return (
    <MailboxSelectionContext.Provider value={selection}>
      {children}
    </MailboxSelectionContext.Provider>
  );
}

export function useMailboxSelection() {
  const selection = useContext(MailboxSelectionContext);
  if (!selection) throw new Error('Mailbox selection provider is missing');
  return selection;
}
