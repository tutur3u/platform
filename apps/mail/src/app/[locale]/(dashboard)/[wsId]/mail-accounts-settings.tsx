'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Mail, Plus, TriangleAlert } from '@tuturuuu/icons';
import {
  type ConnectedMailAccount,
  connectedMailRequest,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import {
  SettingsSection,
  SettingsSectionFooter,
  SettingsSectionMessage,
} from '@tuturuuu/ui/custom/settings-section';
import { useTranslations } from 'next-intl';
import { parseAsString, useQueryState } from 'nuqs';
import { LoadingRegion } from '@tuturuuu/ui/skeleton';
import { useState } from 'react';
import { useCanConnectMailAccounts } from '@/components/mail-actor-provider';
import { useConnectedMailAccounts } from './connected-mail-accounts';
import {
  AccountSkeleton,
  ConnectedAccountRow,
  MailboxRow,
} from './mail-account-rows';
import { useMailSource } from './mail-source';
import { resolveConnectedAccountId } from './mail-source-selection';
import { useMailBootstrap } from './use-mail-bootstrap';

type ConnectedView =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { accounts: ConnectedMailAccount[]; kind: 'ready' };

/**
 * Accounts tab: the mailboxes Mail can switch between, and the Gmail or
 * Outlook accounts connected to this person. Choosing which one is open
 * happens in the sidebar picker.
 */
export function MailAccountsSettings({
  onOpenMailboxSettings,
  workspaceId,
}: {
  onOpenMailboxSettings: (mailboxId: string) => void;
  workspaceId: string;
}) {
  const t = useTranslations('mail');
  const bootstrap = useMailBootstrap(workspaceId);
  const mailboxes = bootstrap.data?.mailboxes ?? [];
  const { source, accountId: requestedAccountId } = useMailSource();
  const [requestedMailboxId] = useQueryState('mailbox', parseAsString);
  const activeMailboxId =
    mailboxes.find((mailbox) => mailbox.id === requestedMailboxId)?.id ??
    mailboxes[0]?.id ??
    null;

  return (
    <div className="space-y-8">
      <SettingsSection
        description={t('source_managed_description')}
        title={t('connected_managed')}
      >
        {bootstrap.isLoading ? (
          <AccountSkeleton />
        ) : mailboxes.length === 0 ? (
          <SettingsSectionMessage>{t('no_mailboxes')}</SettingsSectionMessage>
        ) : (
          mailboxes.map((mailbox) => (
            <MailboxRow
              inUse={source === 'managed' && mailbox.id === activeMailboxId}
              key={mailbox.id}
              mailbox={mailbox}
              onOpenSettings={() => onOpenMailboxSettings(mailbox.id)}
            />
          ))
        )}
      </SettingsSection>
      <ConnectedAccountsSection
        requestedAccountId={requestedAccountId}
        source={source}
        workspaceId={workspaceId}
      />
    </div>
  );
}

function ConnectedAccountsSection({
  requestedAccountId,
  source,
  workspaceId,
}: {
  requestedAccountId: string | null;
  source: 'connected' | 'managed';
  workspaceId: string;
}) {
  const t = useTranslations('mail');
  const cache = useQueryClient();
  const canConnect = useCanConnectMailAccounts();
  const { cacheScope, query } = useConnectedMailAccounts(workspaceId);
  const [, setAccountParam] = useQueryState('account', parseAsString);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const connect = useMutation<
    { authUrl: string },
    Error,
    'google' | 'microsoft'
  >({
    mutationFn: (provider: 'google' | 'microsoft') =>
      connectedMailRequest<{ authUrl: string }>(workspaceId, ['connect'], {
        method: 'POST',
        body: { provider },
      }),
    onSuccess: ({ authUrl }) => window.location.assign(authUrl),
  });
  const disconnect = useMutation({
    mutationFn: (accountId: string) =>
      connectedMailRequest(workspaceId, [accountId], { method: 'DELETE' }),
    onSuccess: async (_result, accountId) => {
      setConfirmId(null);
      // A removed account falls back to the first remaining one in the pane.
      if (
        resolveConnectedAccountId(query.data, requestedAccountId) === accountId
      )
        void setAccountParam(null);
      cache.removeQueries({ queryKey: [...cacheScope, accountId] });
      await cache.invalidateQueries({ queryKey: cacheScope });
    },
  });
  const view: ConnectedView = query.data
    ? { accounts: query.data, kind: 'ready' }
    : query.isError
      ? { kind: 'error' }
      : { kind: 'loading' };
  const actionError = connect.error ?? disconnect.error;
  const connecting = connect.isPending || connect.isSuccess;

  return (
    <SettingsSection
      description={t('source_connected_description')}
      title={t('connected_accounts')}
    >
      {view.kind === 'loading' ? (
        <LoadingRegion srLabel={t('loading')}>
          <AccountSkeleton />
        </LoadingRegion>
      ) : null}
      {view.kind === 'error' ? (
        <SettingsSectionMessage
          action={
            <Button
              onClick={() => void query.refetch()}
              size="sm"
              variant="outline"
            >
              {t('retry')}
            </Button>
          }
          icon={<TriangleAlert className="size-4 shrink-0" />}
          tone="error"
        >
          {t('connected_accounts_error')}
        </SettingsSectionMessage>
      ) : null}
      {view.kind === 'ready' && view.accounts.length === 0 ? (
        <SettingsSectionMessage icon={<Mail className="size-4 shrink-0" />}>
          {t(canConnect ? 'connected_empty' : 'connected_coming_soon')}
        </SettingsSectionMessage>
      ) : null}
      {view.kind === 'ready'
        ? view.accounts.map((account) => (
            <ConnectedAccountRow
              account={account}
              confirming={confirmId === account.id}
              disconnecting={
                disconnect.isPending && disconnect.variables === account.id
              }
              inUse={
                source === 'connected' &&
                resolveConnectedAccountId(view.accounts, requestedAccountId) ===
                  account.id
              }
              key={account.id}
              onCancel={() => setConfirmId(null)}
              onConfirm={() => disconnect.mutate(account.id)}
              onRequestDisconnect={() => {
                disconnect.reset();
                setConfirmId(account.id);
              }}
            />
          ))
        : null}
      {actionError ? (
        <SettingsSectionMessage
          icon={<TriangleAlert className="size-4 shrink-0" />}
          tone="error"
        >
          {actionError.message}
        </SettingsSectionMessage>
      ) : null}
      {canConnect && (
        <SettingsSectionFooter className="justify-start bg-muted/40">
          <Button
            disabled={connecting}
            onClick={() => connect.mutate('google')}
            variant="outline"
          >
            {connecting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            {t('connected_google')}
          </Button>
          <Button
            disabled={connecting}
            onClick={() => connect.mutate('microsoft')}
            variant="outline"
          >
            <Plus className="size-4" />
            {t('connected_microsoft')}
          </Button>
          {connecting ? (
            <span
              className="self-center text-muted-foreground text-sm"
              role="status"
            >
              {t('connecting_provider')}
            </span>
          ) : null}
        </SettingsSectionFooter>
      )}
    </SettingsSection>
  );
}
