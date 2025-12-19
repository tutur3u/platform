'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Loader2, Plus, Trash2, User } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { DEV_MODE } from '@tuturuuu/utils/constants';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import React, { useState } from 'react';

import type { AuthResponse, ConnectedAccount } from './calendar-types';

export interface ConnectedAccountsDialogProps {
  wsId: string;
  children?: React.ReactNode;
}

const isTokenExpiringSoon = (expiresAt: string | null) => {
  if (!expiresAt) return false;
  const expiryTime = new Date(expiresAt).getTime();
  const now = Date.now();
  const fiveMinutes = 5 * 60 * 1000;
  return expiryTime - now < fiveMinutes;
};

const AccountItem = React.memo(
  ({
    account,
    isDisconnecting,
    onDisconnect,
    t,
  }: {
    account: ConnectedAccount;
    isDisconnecting: boolean;
    onDisconnect: (id: string) => void;
    t: any;
  }) => (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
          {account.provider === 'google' ? (
            <Image
              src="/media/logos/google.svg"
              alt="Google"
              width={20}
              height={20}
            />
          ) : (
            <Image
              src="/media/logos/microsoft.svg"
              alt="Microsoft"
              width={20}
              height={20}
            />
          )}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate font-medium text-sm">
              {account.account_name ||
                account.account_email ||
                t('unknown_account')}
            </p>
            {isTokenExpiringSoon(account.expires_at) && (
              <Badge variant="outline" className="text-dynamic-orange text-xs">
                <AlertCircle className="mr-1 h-3 w-3" />
                {t('refresh_needed')}
              </Badge>
            )}
          </div>
          {account.account_email && account.account_name && (
            <p className="truncate text-muted-foreground text-xs">
              {account.account_email}
            </p>
          )}
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onDisconnect(account.id)}
        disabled={isDisconnecting}
      >
        {isDisconnecting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Trash2 className="h-4 w-4" />
        )}
      </Button>
    </div>
  )
);

AccountItem.displayName = 'AccountItem';

export function ConnectedAccountsDialog({
  wsId,
  children,
}: ConnectedAccountsDialogProps) {
  const t = useTranslations('calendar');
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);

  // Fetch connected accounts
  const { data: accountsData, isLoading } = useQuery({
    queryKey: ['calendar-accounts', wsId],
    enabled: open,
    queryFn: async () => {
      const response = await fetch(
        `/api/v1/calendar/auth/accounts?wsId=${wsId}`
      );
      if (!response.ok) throw new Error('Failed to fetch accounts');
      return response.json() as Promise<{
        accounts: ConnectedAccount[];
        grouped: {
          google: ConnectedAccount[];
          microsoft: ConnectedAccount[];
        };
        total: number;
      }>;
    },
    staleTime: 30_000,
  });

  // Google auth mutation
  const googleAuthMutation = useMutation<AuthResponse, Error, void>({
    mutationKey: ['calendar', 'google-auth', wsId],
    mutationFn: async () => {
      const response = await fetch(`/api/v1/calendar/auth?wsId=${wsId}`);
      if (!response.ok) throw new Error('Failed to get auth URL');
      return response.json();
    },
    onSuccess: (data) => {
      if (data.authUrl) {
        window.location.href = data.authUrl;
      } else {
        toast.error(t('auth_url_invalid'));
      }
    },
    onError: () => {
      toast.error(t('google_auth_failed'));
    },
  });

  // Microsoft auth mutation
  const microsoftAuthMutation = useMutation<AuthResponse, Error, void>({
    mutationKey: ['calendar', 'microsoft-auth', wsId],
    mutationFn: async () => {
      const response = await fetch(
        `/api/v1/calendar/auth/microsoft?wsId=${wsId}`
      );
      if (!response.ok) throw new Error('Failed to get auth URL');
      return response.json();
    },
    onSuccess: (data) => {
      if (data.authUrl) {
        window.location.href = data.authUrl;
      } else {
        toast.error(t('auth_url_invalid'));
      }
    },
    onError: () => {
      toast.error(t('microsoft_auth_failed'));
    },
  });

  // Disconnect account mutation
  const disconnectMutation = useMutation({
    mutationFn: async (accountId: string) => {
      const response = await fetch(
        `/api/v1/calendar/auth/accounts?accountId=${accountId}&wsId=${wsId}`,
        { method: 'DELETE' }
      );
      if (!response.ok) throw new Error('Failed to disconnect');
      return response.json();
    },
    onMutate: (accountId: string) => {
      setDisconnectingId(accountId);
    },
    onSuccess: () => {
      toast.success(t('account_disconnected'));
      queryClient.invalidateQueries({ queryKey: ['calendar-accounts', wsId] });
    },
    onError: () => {
      toast.error(t('failed_to_disconnect'));
    },
    onSettled: () => {
      setDisconnectingId(null);
    },
  });

  const handleDisconnect = React.useCallback(
    (accountId: string) => {
      disconnectMutation.mutate(accountId);
    },
    [disconnectMutation]
  );

  const googleAccounts = accountsData?.grouped.google || [];
  const microsoftAccounts = accountsData?.grouped.microsoft || [];
  const totalAccounts = accountsData?.total || 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children || (
          <Button variant="outline" size="sm" className="gap-2">
            <User className="h-4 w-4" />
            {t('connected_accounts')}
            {totalAccounts > 0 && (
              <Badge variant="secondary" className="ml-1">
                {totalAccounts}
              </Badge>
            )}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('manage_calendar_accounts')}</DialogTitle>
          <DialogDescription>
            {t('manage_calendar_accounts_desc')}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="google" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="google" className="gap-2">
              <Image
                src="/media/logos/google.svg"
                alt="Google"
                width={16}
                height={16}
              />
              Google
              {googleAccounts.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs">
                  {googleAccounts.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="microsoft"
              className="gap-2"
              disabled={!DEV_MODE}
            >
              <Image
                src="/media/logos/microsoft.svg"
                alt="Microsoft"
                width={16}
                height={16}
              />
              Outlook
              {!DEV_MODE ? (
                <Badge
                  variant="outline"
                  className="ml-1 text-dynamic-orange text-xs"
                >
                  {t('coming_soon')}
                </Badge>
              ) : (
                microsoftAccounts.length > 0 && (
                  <Badge variant="secondary" className="ml-1 text-xs">
                    {microsoftAccounts.length}
                  </Badge>
                )
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="google" className="mt-4 space-y-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : googleAccounts.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-muted-foreground text-sm">
                  {t('no_google_accounts')}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {googleAccounts.map((account) => (
                  <AccountItem
                    key={account.id}
                    account={account}
                    isDisconnecting={disconnectingId === account.id}
                    onDisconnect={handleDisconnect}
                    t={t}
                  />
                ))}
              </div>
            )}

            <Button
              onClick={() => googleAuthMutation.mutate()}
              disabled={googleAuthMutation.isPending}
              className="w-full gap-2"
              variant="outline"
            >
              {googleAuthMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {t('add_google_account')}
            </Button>
          </TabsContent>

          <TabsContent value="microsoft" className="mt-4 space-y-4">
            {!DEV_MODE ? (
              <div className="space-y-3 py-8 text-center">
                <div className="flex items-center justify-center gap-2">
                  <Image
                    src="/media/logos/microsoft.svg"
                    alt="Microsoft"
                    width={32}
                    height={32}
                    className="opacity-50"
                  />
                </div>
                <p className="font-medium text-muted-foreground text-sm">
                  {t('microsoft_coming_soon')}
                </p>
                <p className="text-muted-foreground text-xs">
                  {t('microsoft_coming_soon_desc')}
                </p>
              </div>
            ) : isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : microsoftAccounts.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-muted-foreground text-sm">
                  {t('no_microsoft_accounts')}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {microsoftAccounts.map((account) => (
                  <AccountItem
                    key={account.id}
                    account={account}
                    isDisconnecting={disconnectingId === account.id}
                    onDisconnect={handleDisconnect}
                    t={t}
                  />
                ))}
              </div>
            )}

            {DEV_MODE && (
              <Button
                onClick={() => microsoftAuthMutation.mutate()}
                disabled={microsoftAuthMutation.isPending}
                className="w-full gap-2"
                variant="outline"
              >
                {microsoftAuthMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {t('add_microsoft_account')}
              </Button>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
