'use client';

import { ArrowRightLeft, Loader2, LogOut, Trash2 } from '@tuturuuu/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import { getInitials } from '@tuturuuu/utils/name-helper';
import { formatDistanceToNow } from 'date-fns';
import { useTranslations } from 'next-intl';
import { type JSX, useState } from 'react';
import { AddAccountButton } from '@/components/account-switcher';
import { useAccountSwitcher } from '@/context/account-switcher-context';
import { RemoveAccountDialog } from './remove-account-dialog';

export function AccountManagementCard(): JSX.Element {
  const t = useTranslations();
  const {
    accounts,
    activeAccountId,
    isLoading,
    logoutAll,
    switchAccount,
    refreshAccounts,
  } = useAccountSwitcher();
  const [accountToRemove, setAccountToRemove] = useState<string | null>(null);
  const [switchingAccountId, setSwitchingAccountId] = useState<string | null>(
    null
  );
  const [isLoggingOutAll, setIsLoggingOutAll] = useState(false);

  const sortedAccounts = [...accounts].sort(
    (a, b) => (b.metadata.lastActiveAt ?? 0) - (a.metadata.lastActiveAt ?? 0)
  );

  const handleSwitchAccount = async (accountId: string) => {
    setSwitchingAccountId(accountId);
    try {
      await switchAccount(accountId);
      // Navigation will happen automatically in switchAccount
    } catch (error) {
      toast.error(t('account_switcher.switch_account_error'), {
        description: error instanceof Error ? error.message : undefined,
      });
      setSwitchingAccountId(null);
    }
  };

  const handleLogoutAll = async () => {
    setIsLoggingOutAll(true);
    try {
      await logoutAll();
    } catch (error) {
      toast.error(t('account_switcher.logout_all_error'), {
        description: error instanceof Error ? error.message : undefined,
      });
      setIsLoggingOutAll(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>{t('account_switcher.manage_accounts')}</CardTitle>
          <CardDescription>
            {t('account_switcher.manage_accounts_description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          )}

          {!isLoading && accounts.length === 0 && (
            <div className="space-y-4 p-8 text-center">
              <p className="text-foreground/60 text-sm">
                {t('account_switcher.no_accounts_found')}
              </p>
              <AddAccountButton />
            </div>
          )}

          {!isLoading && accounts.length > 0 && (
            <div className="space-y-4">
              {sortedAccounts.map((account, index) => {
                const isActive = account.id === activeAccountId;
                const displayName =
                  account.metadata.displayName ||
                  account.email ||
                  t('account_switcher.unknown_user');
                const initials = getInitials(displayName);
                const lastActive =
                  account.metadata.lastActiveAt != null
                    ? formatDistanceToNow(account.metadata.lastActiveAt, {
                        addSuffix: true,
                      })
                    : 'Never';

                return (
                  <div key={account.id}>
                    {index > 0 && <Separator />}
                    <div className="flex items-start gap-4 py-4">
                      <Avatar className="h-12 w-12">
                        <AvatarImage
                          src={account.metadata.avatarUrl ?? undefined}
                          alt={displayName}
                        />
                        <AvatarFallback>{initials}</AvatarFallback>
                      </Avatar>

                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{displayName}</p>
                          {isActive && (
                            <Badge variant="secondary">
                              {t('account_switcher.active')}
                            </Badge>
                          )}
                        </div>
                        {account.email && (
                          <p className="text-foreground/60 text-sm">
                            {account.email}
                          </p>
                        )}
                        <p className="text-foreground/40 text-xs">
                          {t('account_switcher.last_active')}: {lastActive}
                        </p>
                        {account.metadata.lastWorkspaceId && (
                          <p className="text-foreground/40 text-xs">
                            {t('account_switcher.last_workspace')}:{' '}
                            {account.metadata.lastWorkspaceId.substring(0, 8)}
                            ...
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {!isActive && (
                          <>
                            <Button
                              type="button"
                              variant="default"
                              size="sm"
                              onClick={() => handleSwitchAccount(account.id)}
                              disabled={switchingAccountId === account.id}
                            >
                              {switchingAccountId === account.id ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <ArrowRightLeft className="mr-2 h-4 w-4" />
                              )}
                              {t('account_switcher.switch')}
                            </Button>
                            {accounts.length > 1 && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setAccountToRemove(account.id)}
                                disabled={switchingAccountId === account.id}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                {t('account_switcher.remove')}
                              </Button>
                            )}
                          </>
                        )}
                        {isActive && (
                          <span className="text-foreground/40 text-xs">
                            {t('account_switcher.current_account')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              <Separator />

              <div className="pt-2">
                <AddAccountButton />
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={handleLogoutAll}
                disabled={isLoggingOutAll}
                className="w-full justify-start gap-2"
              >
                {isLoggingOutAll ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LogOut className="h-4 w-4 text-dynamic-red" />
                )}
                {t('account_switcher.logout_all')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <RemoveAccountDialog
        accountId={accountToRemove}
        onClose={() => setAccountToRemove(null)}
        onSuccess={refreshAccounts}
      />
    </>
  );
}
