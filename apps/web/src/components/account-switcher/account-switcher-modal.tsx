'use client';

import { useAccountSwitcher } from '@/context/account-switcher-context';
import { Check, Loader2, Plus, Trash2 } from '@tuturuuu/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Separator } from '@tuturuuu/ui/separator';
import { cn } from '@tuturuuu/utils/format';
import { getInitials } from '@tuturuuu/utils/name-helper';
import { formatDistanceToNow } from 'date-fns';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

interface AccountSwitcherModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AccountSwitcherModal({
  open,
  onOpenChange,
}: AccountSwitcherModalProps) {
  const t = useTranslations();
  const {
    accounts,
    activeAccountId,
    isLoading,
    switchAccount,
    addAccount,
    removeAccount,
  } = useAccountSwitcher();

  const [searchQuery, setSearchQuery] = useState('');

  // Filter accounts based on search
  const filteredAccounts = accounts.filter((account) => {
    const searchLower = searchQuery.toLowerCase();
    const displayName = account.metadata.displayName?.toLowerCase() || '';
    const email = account.email?.toLowerCase() || '';
    return displayName.includes(searchLower) || email.includes(searchLower);
  });

  // Reset when modal closes
  useEffect(() => {
    if (!open) {
      setSearchQuery('');
    }
  }, [open]);

  const handleSwitchAccount = async (accountId: string) => {
    if (accountId === activeAccountId || isLoading) return;
    onOpenChange(false);
    await switchAccount(accountId);
  };

  const handleRemoveAccount = async (
    accountId: string,
    e: React.MouseEvent
  ) => {
    e.stopPropagation(); // Prevent triggering switch
    if (isLoading) return;

    if (process.env.NODE_ENV === 'development') {
      console.log(
        '[AccountSwitcherModal] Removing account (count before):',
        accounts.length
      );
    }
    await removeAccount(accountId);
  };

  const handleAddAccount = async () => {
    // Use lazy import to avoid SSR issues
    const { createClient } = await import('@tuturuuu/supabase/next/client');
    const { prepareAddAccountAndNavigate } = await import('./utils');

    await prepareAddAccountAndNavigate({
      createClient,
      addAccount,
      accounts,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('account_switcher.switch_account')}</DialogTitle>
          <DialogDescription>
            {t('account_switcher.switch_account_description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search input */}
          <Input
            placeholder={t('account_switcher.search_accounts')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
          />

          {isLoading && (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          )}

          {!isLoading && (
            <div className="max-h-[450px] space-y-2 overflow-y-auto">
              {filteredAccounts.length === 0 && searchQuery && (
                <div className="p-8 text-center">
                  <p className="text-foreground/60 text-sm">
                    {t('account_switcher.no_results')}
                  </p>
                </div>
              )}

              {filteredAccounts.map((account) => {
                const isActive = account.id === activeAccountId;
                const displayName =
                  account.metadata.displayName ||
                  account.email ||
                  t('account_switcher.unknown_user');
                const initials = getInitials(displayName);
                const lastActive = account.metadata.lastActiveAt
                  ? formatDistanceToNow(account.metadata.lastActiveAt, {
                      addSuffix: true,
                    })
                  : null;

                return (
                  <div key={account.id} className="relative">
                    <button
                      type="button"
                      onClick={() => handleSwitchAccount(account.id)}
                      disabled={isActive || isLoading}
                      className={cn(
                        'group/card relative w-full rounded-lg border p-3 text-left transition-all',
                        isActive
                          ? 'border-dynamic-green/50 bg-dynamic-green/5'
                          : 'border-transparent hover:border-foreground/20 hover:bg-foreground/5',
                        'cursor-pointer'
                      )}
                    >
                      <div className="flex items-start gap-3 pr-8">
                        <Avatar className="h-10 w-10">
                          <AvatarImage
                            src={account.metadata.avatarUrl}
                            alt={displayName}
                          />
                          <AvatarFallback className="bg-foreground/10 font-medium">
                            {initials}
                          </AvatarFallback>
                        </Avatar>

                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate font-semibold text-sm">
                              {displayName}
                            </p>
                            {isActive && (
                              <Badge variant="secondary" className="text-xs">
                                <Check className="mr-1 h-3 w-3" />
                                {t('account_switcher.active')}
                              </Badge>
                            )}
                          </div>

                          {account.email && (
                            <p className="truncate text-foreground/60 text-xs">
                              {account.email}
                            </p>
                          )}

                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-foreground/40 text-xs">
                            {lastActive && (
                              <span>
                                {t('account_switcher.last_active')}:{' '}
                                {lastActive}
                              </span>
                            )}
                            {account.metadata.lastWorkspaceId && (
                              <span className="truncate">
                                WS: {account.metadata.lastWorkspaceId}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>

                    {/* Remove account button (only show if more than 1 account) */}
                    {accounts.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={(e) => handleRemoveAccount(account.id, e)}
                        disabled={isLoading}
                        className="absolute top-2 right-2 h-8 w-8 opacity-0 transition-opacity hover:bg-dynamic-red/10 hover:text-dynamic-red group-hover/card:opacity-100"
                        aria-label={t('account_switcher.remove_account')}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                );
              })}

              {filteredAccounts.length > 0 && <Separator className="my-2" />}

              {/* Add account option */}
              <button
                type="button"
                onClick={handleAddAccount}
                className="group flex w-full items-center gap-3 rounded-lg border border-dashed p-3 transition-all hover:border-foreground/30 hover:bg-foreground/5"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-foreground/10">
                  <Plus className="h-4 w-4" />
                </div>
                <div className="flex-1 text-left">
                  <p className="font-medium text-sm">
                    {t('account_switcher.add_account')}
                  </p>
                  <p className="text-foreground/60 text-xs">
                    {t('account_switcher.add_account_description')}
                  </p>
                </div>
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
