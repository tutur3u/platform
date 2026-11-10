'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  disconnectChatGPT,
  getChatGPTConnections,
} from '@tuturuuu/internal-api/chatgpt';
import type { AIModelUI } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useAccountSwitcher } from '@/context/account-switcher-context';

export function ChatGPTPlanPicker({
  model,
  onChange,
}: {
  model: AIModelUI;
  onChange: (model: AIModelUI) => void;
}) {
  const { activeAccountId } = useAccountSwitcher();
  const queryKey = ['chatgpt-connections', activeAccountId];
  const t = useTranslations('dashboard.mira_chat.chatgpt');
  const queryClient = useQueryClient();
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [remoteRevocationUnconfirmed, setRemoteRevocationUnconfirmed] =
    useState(false);
  const { data, isFetching, isError, refetch } = useQuery({
    queryKey,
    queryFn: () => getChatGPTConnections(),
    staleTime: 60_000,
    retry: false,
  });
  const disconnect = useMutation({
    mutationFn: (clientId: string) => disconnectChatGPT(clientId),
    onSuccess: async ({ remoteRevoked }, clientId) => {
      if (model.value.startsWith(`chatgpt/${clientId}/`))
        onChange({ ...model, disabled: true });
      setRemoteRevocationUnconfirmed(!remoteRevoked);
      await queryClient.invalidateQueries({ queryKey });
    },
  });
  if (data?.enabled === false || (!data && !isError)) return null;
  if (!data)
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={() => void refetch()}
        disabled={isFetching}
      >
        {t('refresh')}
      </Button>
    );
  const active = model.value.startsWith('chatgpt/');
  const selectedClient = active ? model.value.split('/')[1] : undefined;

  function selectModel(value: string) {
    const account = data?.accounts.find((entry) =>
      value.startsWith(`chatgpt/${entry.clientId}/`)
    );
    const choice = account?.models.find(
      (entry) => value === `chatgpt/${account.clientId}/${entry.slug}`
    );
    if (!account || !choice) return;
    setRemoteRevocationUnconfirmed(false);
    onChange({ value, provider: 'chatgpt', label: choice.display_name });
    const welcomeKey = `chatgpt-plan-welcome:${data?.userId}:${account.clientId}`;
    if (localStorage.getItem(welcomeKey) !== 'seen') {
      localStorage.setItem(welcomeKey, 'seen');
      setWelcomeOpen(true);
    }
  }

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant={active ? 'secondary' : 'ghost'}
            className="h-7 text-xs"
          >
            {active ? t('using_plan') : t('title')}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 space-y-3" align="start">
          <div>
            <h3 className="font-medium">{t('title')}</h3>
            <p className="mt-1 text-muted-foreground text-xs">
              {t('description')}
            </p>
          </div>
          <p className="text-muted-foreground text-xs">{t('limits')}</p>
          <label className="block space-y-1 text-sm">
            <span>{t('account_model')}</span>
            <select
              aria-label={t('account_model')}
              className="w-full rounded-md border bg-background p-2 text-sm"
              value={active ? model.value : ''}
              onChange={(event) => selectModel(event.target.value)}
            >
              <option value="" disabled>
                {t('choose')}
              </option>
              {active &&
                !data.accounts.some(
                  (account) =>
                    account.available &&
                    account.models.some(
                      (choice) =>
                        model.value ===
                        `chatgpt/${account.clientId}/${choice.slug}`
                    )
                ) && (
                  <option value={model.value} disabled>
                    {t('unavailable')}
                  </option>
                )}
              {data.accounts.map((account) => (
                <optgroup
                  key={account.clientId}
                  label={account.label}
                  disabled={!account.available}
                >
                  {account.models.map((choice) => (
                    <option
                      key={choice.slug}
                      value={`chatgpt/${account.clientId}/${choice.slug}`}
                    >
                      {choice.display_name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <details className="text-xs">
            <summary className="cursor-pointer font-medium">
              {t('connect')}
            </summary>
            <p className="mt-2 text-muted-foreground">{t('setup')}</p>
            <code className="mt-2 block break-all rounded bg-muted p-2">
              bun scripts/chatgpt-connect.ts --user {data.userId}
              {selectedClient ? ` --client ${selectedClient}` : ''}
            </code>
          </details>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isFetching}
              onClick={() => void refetch()}
            >
              {t('refresh')}
            </Button>
            {selectedClient && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={disconnect.isPending}
                onClick={() => {
                  onChange({ ...model, disabled: true });
                  disconnect.mutate(selectedClient);
                }}
              >
                {t('disconnect')}
              </Button>
            )}
            <a
              className="text-sm underline"
              href="https://chatgpt.com/settings/usage"
              target="_blank"
              rel="noreferrer"
            >
              {t('manage_usage')}
            </a>
          </div>
          {disconnect.isError && (
            <p role="alert" className="text-destructive text-xs">
              {t('disconnect_error')}
            </p>
          )}
          {remoteRevocationUnconfirmed && (
            <p role="alert" className="text-muted-foreground text-xs">
              {t('revoke_unconfirmed')}
            </p>
          )}
          {data.accounts.some((account) => !account.available) && (
            <p className="text-muted-foreground text-xs">{t('unavailable')}</p>
          )}
        </PopoverContent>
      </Popover>
      {active && (
        <a
          href="https://chatgpt.com/settings/usage"
          target="_blank"
          rel="noreferrer"
          className="text-muted-foreground text-xs underline"
        >
          {t('manage_usage')}
        </a>
      )}
      <Dialog open={welcomeOpen} onOpenChange={setWelcomeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('welcome')}</DialogTitle>
            <DialogDescription>{t('description')}</DialogDescription>
          </DialogHeader>
          <Button onClick={() => setWelcomeOpen(false)}>{t('got_it')}</Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
