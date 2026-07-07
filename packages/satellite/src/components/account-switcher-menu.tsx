'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ExternalLink, Trash2, User, Users } from '@tuturuuu/icons';
import type { WebAccountSummary } from '@tuturuuu/internal-api/auth';
import {
  listWebAccountsWithInternalApi,
  removeWebAccountWithInternalApi,
  switchWebAccountWithInternalApi,
} from '@tuturuuu/internal-api/auth';
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { usePathname, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

interface SatelliteAccountSwitcherMenuProps {
  centralUrl: string;
}

const accountQueryKey = (centralUrl: string) =>
  ['satellite', 'web-accounts', centralUrl] as const;

function accountLabel(account: WebAccountSummary, fallback: string) {
  return (
    account.metadata.displayName?.trim() || account.email?.trim() || fallback
  );
}

function webAccountSettingsUrl(centralUrl: string) {
  return `${centralUrl.replace(/\/+$/u, '')}/settings/account/accounts`;
}

export function SatelliteAccountSwitcherMenu({
  centralUrl,
}: SatelliteAccountSwitcherMenuProps) {
  const t = useTranslations('account_switcher');
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentRoute = useMemo(() => {
    const queryString = searchParams.toString();
    return `${pathname}${queryString ? `?${queryString}` : ''}`;
  }, [pathname, searchParams]);
  const queryKey = accountQueryKey(centralUrl);
  const accountsQuery = useQuery({
    enabled: Boolean(centralUrl),
    queryFn: () => listWebAccountsWithInternalApi({ baseUrl: centralUrl }),
    queryKey,
    retry: 1,
    staleTime: 30_000,
  });
  const invalidateAccounts = () => queryClient.invalidateQueries({ queryKey });
  const switchMutation = useMutation({
    mutationFn: (accountId: string) =>
      switchWebAccountWithInternalApi(
        accountId,
        {
          currentRoute,
        },
        { baseUrl: centralUrl }
      ),
    onSuccess: async (response) => {
      await invalidateAccounts();
      if (response.success) window.location.reload();
    },
  });
  const removeMutation = useMutation({
    mutationFn: (accountId: string) =>
      removeWebAccountWithInternalApi(accountId, { baseUrl: centralUrl }),
    onSuccess: async (response, accountId) => {
      await invalidateAccounts();
      if (
        response.success &&
        accountId === accountsQuery.data?.activeAccountId
      ) {
        window.location.reload();
      }
    },
  });
  const accounts = accountsQuery.data?.accounts ?? [];
  const activeAccountId = accountsQuery.data?.activeAccountId ?? null;
  const isMutating = switchMutation.isPending || removeMutation.isPending;

  if (accountsQuery.isLoading) {
    return (
      <DropdownMenuItem disabled>
        <Users className="h-4 w-4 text-dynamic-orange" />
        <span>{t('please_wait')}</span>
      </DropdownMenuItem>
    );
  }

  if (accounts.length === 0) {
    return (
      <DropdownMenuItem asChild>
        <a
          href={webAccountSettingsUrl(centralUrl)}
          target="_blank"
          rel="noopener noreferrer"
          className="cursor-pointer"
        >
          <Users className="h-4 w-4 text-dynamic-orange" />
          <span>{t('manage_accounts')}</span>
        </a>
      </DropdownMenuItem>
    );
  }

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Users className="h-4 w-4 text-dynamic-orange" />
        <span>{t('switch_account')}</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent sideOffset={4} className="w-72">
          <DropdownMenuLabel>{t('accounts')}</DropdownMenuLabel>
          {accounts.map((account) => {
            const isActive = account.id === activeAccountId;
            const label = accountLabel(account, t('unknown_user'));

            return (
              <DropdownMenuItem
                key={account.id}
                disabled={isActive || isMutating}
                onSelect={() => {
                  if (!isActive) switchMutation.mutate(account.id);
                }}
              >
                <User className="h-4 w-4" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{label}</span>
                  {account.email && (
                    <span className="block truncate text-xs opacity-70">
                      {account.email}
                    </span>
                  )}
                </span>
                {isActive && <Check className="h-4 w-4" />}
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger disabled={isMutating}>
              <Trash2 className="h-4 w-4 text-dynamic-red" />
              <span>{t('remove_account')}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              <DropdownMenuSubContent sideOffset={4} className="w-72">
                {accounts.map((account) => {
                  const isActive = account.id === activeAccountId;
                  const label = accountLabel(account, t('unknown_user'));

                  return (
                    <DropdownMenuItem
                      key={account.id}
                      disabled={isActive || isMutating}
                      onSelect={() => {
                        if (!isActive) removeMutation.mutate(account.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-dynamic-red" />
                      <span className="truncate">
                        {isActive ? t('current_account') : label}
                      </span>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
          <DropdownMenuItem asChild>
            <a
              href={webAccountSettingsUrl(centralUrl)}
              target="_blank"
              rel="noopener noreferrer"
              className="cursor-pointer"
            >
              <ExternalLink className="h-4 w-4" />
              <span>{t('manage_accounts')}</span>
            </a>
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  );
}
