'use client';

import { useQuery } from '@tanstack/react-query';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  type ContactAccountChoice,
  listContactAccountChoices,
} from './contact-account-invitation-api';

export function accountLabel(account: ContactAccountChoice) {
  return account.display_name?.trim() || account.email || account.id;
}

export function ContactAccountPicker({
  open,
  onOpenChange,
  onInvite,
  pending,
  workspaceId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInvite: (accountId: string) => void;
  pending: boolean;
  workspaceId: string;
}) {
  const t = useTranslations('contact-account-link');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<ContactAccountChoice | null>(null);
  const accounts = useQuery({
    queryKey: ['contact-account-choices', workspaceId],
    queryFn: () => listContactAccountChoices(workspaceId),
    enabled: open,
    staleTime: 60_000,
  });
  const needle = query.trim().toLowerCase();
  const matches = (accounts.data ?? [])
    .filter((account) =>
      [account.display_name, account.email, account.id].some((value) =>
        value?.toLowerCase().includes(needle)
      )
    )
    .slice(0, 40);

  const close = (next: boolean) => {
    if (!next) {
      setQuery('');
      setSelected(null);
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('invite')}</DialogTitle>
          <DialogDescription>{t('instructions')}</DialogDescription>
        </DialogHeader>
        {selected ? (
          <div className="rounded-md border p-3">
            <p className="font-medium">{accountLabel(selected)}</p>
            {selected.email ? (
              <p className="text-muted-foreground text-sm">{selected.email}</p>
            ) : null}
          </div>
        ) : (
          <div className="space-y-2">
            <Input
              aria-label={t('search')}
              placeholder={t('search')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {accounts.isPending ? (
              <p className="text-muted-foreground text-sm">{t('loading')}</p>
            ) : accounts.isError ? (
              <Button variant="outline" onClick={() => accounts.refetch()}>
                {t('retry')}
              </Button>
            ) : matches.length === 0 ? (
              <p className="text-muted-foreground text-sm">{t('none')}</p>
            ) : (
              <ul className="max-h-72 divide-y overflow-y-auto rounded-md border">
                {matches.map((account) => (
                  <li key={account.id}>
                    <button
                      type="button"
                      className="w-full px-3 py-2 text-left hover:bg-accent"
                      onClick={() => setSelected(account)}
                    >
                      <span className="block font-medium">
                        {accountLabel(account)}
                      </span>
                      {account.email ? (
                        <span className="block text-muted-foreground text-sm">
                          {account.email}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {selected ? (
          <DialogFooter>
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => setSelected(null)}
            >
              {t('choose_another')}
            </Button>
            <Button disabled={pending} onClick={() => onInvite(selected.id)}>
              {t('create')}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
