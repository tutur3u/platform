'use client';

import { Loader2, Settings, Users } from '@tuturuuu/icons';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useAccountSwitcher } from '@/context/account-switcher-context';
import { AccountItem } from './account-item';
import { AddAccountButton } from './add-account-button';

interface AccountSwitcherMenuProps {
  children: React.ReactNode;
}

export function AccountSwitcherMenu({ children }: AccountSwitcherMenuProps) {
  const t = useTranslations();
  const { accounts, activeAccountId, isLoading, switchAccount } =
    useAccountSwitcher();

  const handleSwitchAccount = async (accountId: string) => {
    if (accountId === activeAccountId || isLoading) return;
    await switchAccount(accountId);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent className="w-80" align="end">
        <DropdownMenuLabel className="flex items-center gap-2">
          <Users className="h-4 w-4" />
          {t('account_switcher.accounts')}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {isLoading && (
          <div className="flex items-center justify-center p-4">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}

        {!isLoading && accounts.length === 0 && (
          <div className="p-4 text-center text-foreground/60 text-sm">
            {t('account_switcher.no_accounts')}
          </div>
        )}

        {!isLoading && accounts.length > 0 && (
          <DropdownMenuGroup className="max-h-[400px] overflow-y-auto">
            <div className="space-y-1 p-2">
              {accounts.map((account) => (
                <DropdownMenuItem
                  key={account.id}
                  asChild
                  onSelect={() => handleSwitchAccount(account.id)}
                >
                  <AccountItem
                    account={account}
                    isActive={account.id === activeAccountId}
                  />
                </DropdownMenuItem>
              ))}
            </div>
          </DropdownMenuGroup>
        )}

        <DropdownMenuSeparator />

        <div className="p-2">
          <AddAccountButton />
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link
            href={`/settings/account/accounts`}
            className="flex items-center gap-2"
          >
            <Settings className="h-4 w-4" />
            {t('account_switcher.manage_accounts')}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
