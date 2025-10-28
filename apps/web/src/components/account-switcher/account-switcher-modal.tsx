'use client';

import { useAccountSwitcher } from '@/context/account-switcher-context';
import { Check, Loader2, Plus, Search, Trash2 } from '@tuturuuu/icons';
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
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Filter accounts based on search
  const filteredAccounts = accounts.filter((account) => {
    const searchLower = searchQuery.toLowerCase();
    const displayName = account.metadata.displayName?.toLowerCase() || '';
    const email = account.email?.toLowerCase() || '';
    return displayName.includes(searchLower) || email.includes(searchLower);
  });

  // Reset selection when search changes
  useEffect(() => {
    if (searchQuery) setSelectedIndex(0);
  }, [searchQuery]);

  // Reset when modal closes
  useEffect(() => {
    if (!open) {
      setSearchQuery('');
      setSelectedIndex(0);
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

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    const totalItems = filteredAccounts.length + 1; // +1 for "Add account" option

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % totalItems);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + totalItems) % totalItems);
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex < filteredAccounts.length) {
          // Switch to selected account
          handleSwitchAccount(filteredAccounts[selectedIndex]!.id);
        } else {
          // Add new account
          handleAddAccount();
        }
        break;
      case '1':
      case '2':
      case '3':
      case '4':
      case '5':
      case '6':
      case '7':
      case '8':
      case '9': {
        // Quick switch with number keys (if not typing in search)
        const target = e.target as HTMLElement;
        if (target.tagName !== 'INPUT') {
          const index = Number.parseInt(e.key, 10) - 1;
          if (index < filteredAccounts.length) {
            handleSwitchAccount(filteredAccounts[index]!.id);
          }
        }
        break;
      }
      default:
        break;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg gap-6" onKeyDown={handleKeyDown}>
        <DialogHeader className="space-y-3">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br from-dynamic-purple to-dynamic-pink text-white shadow-sm">
              <Search className="h-5 w-5" />
            </div>
            {t('account_switcher.switch_account')}
          </DialogTitle>
          <DialogDescription className="text-foreground/60">
            {t('account_switcher.switch_account_description')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search input */}
          <div className="relative">
            <Search className="-translate-y-1/2 absolute top-1/2 left-3 h-5 w-5 text-foreground/40" />
            <Input
              placeholder={t('account_switcher.search_accounts')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-12 border-2 pl-10 text-base focus-visible:border-dynamic-blue/50 focus-visible:ring-dynamic-blue/20"
              autoFocus
            />
          </div>

          {isLoading && (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          )}

          {!isLoading && (
            <div className="max-h-[450px] space-y-2 overflow-y-auto">
              {filteredAccounts.length === 0 && searchQuery && (
                <div className="flex flex-col items-center gap-2 p-12 text-center">
                  <Search className="h-12 w-12 text-foreground/20" />
                  <p className="text-foreground/60 text-sm">
                    {t('account_switcher.no_results')}
                  </p>
                </div>
              )}

              {filteredAccounts.map((account, index) => {
                const isActive = account.id === activeAccountId;
                const isSelected = selectedIndex === index;
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
                        'group/card relative w-full rounded-xl border-2 p-4 text-left transition-all',
                        isActive
                          ? 'border-dynamic-green/50 bg-dynamic-green/5'
                          : isSelected
                            ? 'border-dynamic-blue/50 bg-dynamic-blue/5 shadow-md'
                            : 'border-transparent hover:border-dynamic-blue/30 hover:bg-foreground/5',
                        'cursor-pointer'
                      )}
                    >
                      <div className="flex items-start gap-3 pr-8">
                        <Avatar className="h-12 w-12 border-2 border-background shadow-sm">
                          <AvatarImage
                            src={account.metadata.avatarUrl}
                            alt={displayName}
                          />
                          <AvatarFallback className="bg-linear-to-br from-dynamic-purple to-dynamic-pink font-semibold text-white">
                            {initials}
                          </AvatarFallback>
                        </Avatar>

                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate font-semibold text-sm">
                              {displayName}
                            </p>
                            {isActive && (
                              <Badge
                                variant="secondary"
                                className="border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green"
                              >
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

                          {index < 9 && !isActive && (
                            <div className="mt-1 flex items-center gap-1 text-foreground/30 text-xs">
                              <kbd className="rounded bg-foreground/5 px-1.5 py-0.5 font-mono">
                                {index + 1}
                              </kbd>
                              <span>to switch</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Selection indicator */}
                      {isSelected && !isActive && (
                        <div className="-right-px -top-px absolute h-3 w-3 rounded-tr-xl rounded-bl-lg border-dynamic-blue/50 border-b-2 border-l-2 bg-dynamic-blue/20" />
                      )}
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
                className={cn(
                  'group flex w-full items-center gap-3 rounded-xl border-2 p-4 transition-all',
                  selectedIndex === filteredAccounts.length
                    ? 'border-dynamic-blue/50 bg-dynamic-blue/5 shadow-md'
                    : 'border-foreground/20 border-dashed hover:border-dynamic-blue/30 hover:bg-foreground/5'
                )}
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-linear-to-br from-dynamic-blue to-dynamic-cyan text-white shadow-sm transition-transform group-hover:scale-110">
                  <Plus className="h-5 w-5" />
                </div>
                <div className="flex-1 text-left">
                  <p className="font-semibold text-sm">
                    {t('account_switcher.add_account')}
                  </p>
                  <p className="text-foreground/60 text-xs">
                    {t('account_switcher.add_account_description')}
                  </p>
                </div>
              </button>
            </div>
          )}

          {/* Keyboard hints */}
          <div className="border-t pt-3 text-foreground/60 text-xs">
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span>
                <kbd className="rounded bg-foreground/10 px-1.5 py-0.5">↑↓</kbd>{' '}
                {t('account_switcher.navigate')}
              </span>
              <span>
                <kbd className="rounded bg-foreground/10 px-1.5 py-0.5">⏎</kbd>{' '}
                {t('account_switcher.select')}
              </span>
              <span>
                <kbd className="rounded bg-foreground/10 px-1.5 py-0.5">
                  1-9
                </kbd>{' '}
                {t('account_switcher.quick_switch')}
              </span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
