'use client';

import {
  Check,
  ChevronsUpDown,
  Loader2,
  Mail,
  Settings,
  Users,
} from '@tuturuuu/icons';
import type {
  ConnectedMailAccount,
  MailMailbox,
} from '@tuturuuu/internal-api';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@tuturuuu/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { useTranslations } from 'next-intl';
import { type ReactNode, useState } from 'react';
import { groupMailboxes } from './mailbox-groups';
import type { MailSelection } from './mail-source-selection';

const SEARCH_THRESHOLD = 5;

export type MailAccountPickerState = {
  accountId: string | null;
  accounts: ConnectedMailAccount[];
  loading: boolean;
  mailboxId: string | null;
  mailboxes: MailMailbox[];
  source: 'connected' | 'managed';
};

/** One switcher for managed mailboxes and connected Gmail or Outlook accounts. */
export function MailAccountPicker({
  onManage,
  onSelect,
  state,
}: {
  onManage: () => void;
  onSelect: (selection: MailSelection) => void;
  state: MailAccountPickerState;
}) {
  const t = useTranslations('mail');
  const [open, setOpen] = useState(false);
  const { accountId, accounts, loading, mailboxId, mailboxes, source } = state;
  const activeMailbox =
    source === 'managed'
      ? (mailboxes.find((mailbox) => mailbox.id === mailboxId) ?? null)
      : null;
  const activeAccount =
    source === 'connected'
      ? (accounts.find((account) => account.id === accountId) ?? null)
      : null;
  const groups = groupMailboxes(mailboxes, t('shared_mailboxes'));
  const choose = (selection: MailSelection) => {
    setOpen(false);
    onSelect(selection);
  };
  const providerLabel = (provider: ConnectedMailAccount['provider']) =>
    provider === 'google' ? t('provider_google') : t('provider_microsoft');

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger asChild>
        <button
          aria-label={t('switch_account')}
          className="flex w-full items-center gap-2.5 rounded-lg border bg-card px-2.5 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-expanded:border-ring"
          type="button"
        >
          {loading && !activeMailbox && !activeAccount ? (
            <>
              <PickerAvatar>
                <Loader2 className="size-4 animate-spin" />
              </PickerAvatar>
              <span className="min-w-0 flex-1 truncate text-muted-foreground text-sm">
                {t('loading')}
              </span>
            </>
          ) : activeMailbox || activeAccount ? (
            <PickerSummary
              account={activeAccount}
              mailbox={activeMailbox}
              providerLabel={providerLabel}
            />
          ) : (
            <>
              <PickerAvatar>
                <Mail className="size-4" />
              </PickerAvatar>
              <span className="min-w-0 flex-1 truncate text-muted-foreground text-sm">
                {t('no_mailboxes')}
              </span>
            </>
          )}
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-(--radix-popover-trigger-width) min-w-64 p-0 [--popover-padding:0.25rem]"
      >
        <Command>
          {mailboxes.length + accounts.length >= SEARCH_THRESHOLD ? (
            <CommandInput placeholder={t('search_mailboxes')} />
          ) : null}
          <CommandList>
            <CommandEmpty>{t('no_matching_mailboxes')}</CommandEmpty>
            {groups.personal.length > 0 ? (
              <CommandGroup heading={groupHeading(t('connected_managed'))}>
                {groups.personal.map((mailbox) => (
                  <MailboxOption
                    active={activeMailbox?.id === mailbox.id}
                    key={mailbox.id}
                    mailbox={mailbox}
                    onSelect={() =>
                      choose({ kind: 'managed', mailboxId: mailbox.id })
                    }
                    personalLabel={t('personal_mailbox')}
                  />
                ))}
              </CommandGroup>
            ) : null}
            {groups.shared.map((group) => (
              <CommandGroup
                heading={groupHeading(group.label, group.mailboxes.length)}
                key={group.label}
              >
                {group.mailboxes.map((mailbox) => (
                  <MailboxOption
                    active={activeMailbox?.id === mailbox.id}
                    key={mailbox.id}
                    mailbox={mailbox}
                    onSelect={() =>
                      choose({ kind: 'managed', mailboxId: mailbox.id })
                    }
                  />
                ))}
              </CommandGroup>
            ))}
            {accounts.length > 0 ? (
              <CommandGroup
                heading={groupHeading(
                  t('connected_accounts'),
                  accounts.length
                )}
              >
                {accounts.map((account) => (
                  <CommandItem
                    aria-current={
                      activeAccount?.id === account.id ? 'true' : undefined
                    }
                    key={account.id}
                    keywords={[providerLabel(account.provider)]}
                    onSelect={() =>
                      choose({ kind: 'connected', accountId: account.id })
                    }
                    value={`connected:${account.id}:${account.address}`}
                  >
                    <CheckSlot active={activeAccount?.id === account.id} />
                    <OptionText
                      subtitle={providerLabel(account.provider)}
                      title={account.address}
                    />
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
          </CommandList>
          <div className="border-t p-1">
            <button
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 font-medium text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => {
                setOpen(false);
                onManage();
              }}
              type="button"
            >
              <Settings className="size-4 shrink-0 text-muted-foreground" />
              {t('manage_accounts')}
            </button>
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function groupHeading(label: string, count?: number): ReactNode {
  return (
    <span className="flex items-center justify-between gap-2">
      <span className="truncate">{label}</span>
      {count && count > 0 ? (
        <span className="tabular-nums">{count}</span>
      ) : null}
    </span>
  );
}

function PickerAvatar({ children }: { children: ReactNode }) {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
      {children}
    </span>
  );
}

function PickerSummary({
  account,
  mailbox,
  providerLabel,
}: {
  account: ConnectedMailAccount | null;
  mailbox: MailMailbox | null;
  providerLabel: (provider: ConnectedMailAccount['provider']) => string;
}) {
  const unread = mailbox?.unreadCount ?? 0;
  return (
    <>
      <PickerAvatar>
        {mailbox?.type === 'shared' ? (
          <Users className="size-4" />
        ) : (
          <Mail className="size-4" />
        )}
      </PickerAvatar>
      <OptionText
        subtitle={
          mailbox ? mailbox.address : account ? providerLabel(account.provider) : ''
        }
        title={mailbox ? mailbox.displayName : (account?.address ?? '')}
      />
      {unread > 0 ? <UnreadPill count={unread} /> : null}
    </>
  );
}

function MailboxOption({
  active,
  mailbox,
  onSelect,
  personalLabel,
}: {
  active: boolean;
  mailbox: MailMailbox;
  onSelect: () => void;
  personalLabel?: string;
}) {
  return (
    <CommandItem
      aria-current={active ? 'true' : undefined}
      keywords={[mailbox.address]}
      onSelect={onSelect}
      value={`managed:${mailbox.id}:${mailbox.displayName}`}
    >
      <CheckSlot active={active} />
      <OptionText subtitle={mailbox.address} title={mailbox.displayName} />
      {personalLabel ? (
        <span className="shrink-0 rounded-full border bg-muted px-1.5 py-0.5 font-medium text-muted-foreground text-xs">
          {personalLabel}
        </span>
      ) : null}
      {(mailbox.unreadCount ?? 0) > 0 ? (
        <UnreadPill count={mailbox.unreadCount ?? 0} />
      ) : null}
    </CommandItem>
  );
}

function CheckSlot({ active }: { active: boolean }) {
  return (
    <span className="flex size-4 shrink-0 items-center justify-center">
      {active ? <Check aria-hidden="true" className="size-4" /> : null}
    </span>
  );
}

function OptionText({
  subtitle,
  title,
}: {
  subtitle: string;
  title: string;
}) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block truncate font-medium text-sm">{title}</span>
      <span className="block truncate text-muted-foreground text-xs">
        {subtitle}
      </span>
    </span>
  );
}

function UnreadPill({ count }: { count: number }) {
  return (
    <span className="shrink-0 rounded-full bg-foreground px-2 py-0.5 text-background text-xs tabular-nums">
      {count}
    </span>
  );
}
