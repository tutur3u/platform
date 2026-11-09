'use client';

import { ArrowRightLeft, Loader2, LogOut, Trash2 } from '@tuturuuu/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import {
  SettingsSection,
  SettingsSectionBlock,
  SettingsSectionMessage,
} from '@tuturuuu/ui/custom/settings-section';
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
      <SettingsSection
        title={t('account_switcher.manage_accounts')}
        description={t('account_switcher.manage_accounts_description')}
      >
        {isLoading && (
          <SettingsSectionMessage className="justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-foreground" />
          </SettingsSectionMessage>
        )}

        {!isLoading && accounts.length === 0 && (
          <SettingsSectionMessage action={<AddAccountButton />}>
            {t('account_switcher.no_accounts_found')}
          </SettingsSectionMessage>
        )}

        {!isLoading &&
          accounts.length > 0 &&
          sortedAccounts.map((account) => {
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
              <SettingItemTab
                key={account.id}
                title={
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar className="size-10">
                      <AvatarImage
                        src={account.metadata.avatarUrl ?? undefined}
                        alt={displayName}
                      />
                      <AvatarFallback>{initials}</AvatarFallback>
                    </Avatar>

                    <div className="min-w-0 space-y-0.5 font-normal">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium">{displayName}</p>
                        {isActive && (
                          <Badge variant="secondary">
                            {t('account_switcher.active')}
                          </Badge>
                        )}
                      </div>
                      {account.email && (
                        <p className="truncate text-muted-foreground">
                          {account.email}
                        </p>
                      )}
                      <p className="text-muted-foreground text-xs">
                        {t('account_switcher.last_active')}: {lastActive}
                      </p>
                      {account.metadata.lastWorkspaceId && (
                        <p className="text-muted-foreground text-xs">
                          {t('account_switcher.last_workspace')}:{' '}
                          {account.metadata.lastWorkspaceId.substring(0, 8)}
                          ...
                        </p>
                      )}
                    </div>
                  </div>
                }
              >
                <div className="flex items-center gap-2">
                  {!isActive && (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleSwitchAccount(account.id)}
                        disabled={switchingAccountId === account.id}
                      >
                        {switchingAccountId === account.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <ArrowRightLeft className="h-4 w-4" />
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
                          <Trash2 className="h-4 w-4" />
                          {t('account_switcher.remove')}
                        </Button>
                      )}
                    </>
                  )}
                  {isActive && (
                    <span className="text-muted-foreground text-sm">
                      {t('account_switcher.current_account')}
                    </span>
                  )}
                </div>
              </SettingItemTab>
            );
          })}

        {!isLoading && accounts.length > 0 && (
          <SettingsSectionBlock className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <AddAccountButton />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleLogoutAll}
              disabled={isLoggingOutAll}
            >
              {isLoggingOutAll ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="h-4 w-4 text-dynamic-red" />
              )}
              {t('account_switcher.logout_all')}
            </Button>
          </SettingsSectionBlock>
        )}
      </SettingsSection>

      <RemoveAccountDialog
        accountId={accountToRemove}
        onClose={() => setAccountToRemove(null)}
        onSuccess={refreshAccounts}
      />
    </>
  );
}
