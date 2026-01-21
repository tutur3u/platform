'use client';

import { useQuery } from '@tanstack/react-query';
import { Check, Wallet, X } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@tuturuuu/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface WorkspaceWallet {
  id: string;
  name: string | null;
  balance: number | null;
}

interface WalletFilterProps {
  wsId: string;
  selectedWalletIds: string[];
  onWalletsChange: (walletIds: string[]) => void;
  className?: string;
}

// Function to fetch workspace wallets
async function fetchWorkspaceWallets(wsId: string): Promise<WorkspaceWallet[]> {
  const res = await fetch(`/api/workspaces/${wsId}/wallets`);
  if (!res.ok) throw new Error('Failed to fetch wallets');
  return res.json();
}

export function WalletFilter({
  wsId,
  selectedWalletIds,
  onWalletsChange,
  className,
}: WalletFilterProps) {
  const t = useTranslations();
  const [isOpen, setIsOpen] = useState(false);

  const hasActiveFilters = selectedWalletIds.length > 0;

  // Use React Query to fetch and cache workspace wallets
  const {
    data: wallets = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['workspace-wallets', wsId],
    queryFn: () => fetchWorkspaceWallets(wsId),
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
    gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
    enabled: !!wsId, // Only run query if wsId is provided
  });

  const handleWalletToggle = (walletId: string) => {
    const newSelectedWalletIds = selectedWalletIds.includes(walletId)
      ? selectedWalletIds.filter((id) => id !== walletId)
      : [...selectedWalletIds, walletId];

    onWalletsChange(newSelectedWalletIds);
  };

  const clearAllFilters = () => {
    onWalletsChange([]);
  };

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {/* Wallet Filter Dropdown */}
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1.5">
            <Wallet className="h-3 w-3" />
            <span className="text-xs">{t('finance.filter_by_wallets')}</span>
            {hasActiveFilters && (
              <Badge
                variant="secondary"
                className="ml-1 h-5 rounded-full px-1.5 text-xs"
              >
                {selectedWalletIds.length}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[280px] p-0" align="start">
          <Command>
            <CommandInput placeholder={t('finance.search_wallets')} />
            <CommandList>
              <CommandEmpty>
                {isLoading
                  ? t('finance.loading_wallets')
                  : t('finance.no_wallets_found')}
              </CommandEmpty>

              {error && (
                <CommandGroup>
                  <CommandItem disabled className="text-destructive">
                    {error instanceof Error
                      ? error.message
                      : t('finance.failed_to_load_wallets')}
                  </CommandItem>
                </CommandGroup>
              )}

              {!isLoading && !error && wallets.length > 0 && (
                <CommandGroup>
                  {wallets
                    .sort((a, b) => {
                      // Sort selected wallets to the top
                      const aSelected = selectedWalletIds.includes(a.id);
                      const bSelected = selectedWalletIds.includes(b.id);

                      if (aSelected && !bSelected) return -1;
                      if (!aSelected && bSelected) return 1;

                      // For wallets with the same selection status, sort by name
                      return (a.name || '').localeCompare(b.name || '');
                    })
                    .map((wallet) => {
                      const isSelected = selectedWalletIds.includes(wallet.id);

                      return (
                        <CommandItem
                          key={wallet.id}
                          onSelect={() => handleWalletToggle(wallet.id)}
                          className="flex cursor-pointer items-center gap-2"
                        >
                          <div
                            className={cn(
                              'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
                              isSelected
                                ? 'bg-primary text-primary-foreground'
                                : 'opacity-50 [&_svg]:invisible'
                            )}
                          >
                            <Check className="h-4 w-4" />
                          </div>
                          <div className="flex flex-1 items-center gap-2">
                            <Wallet className="h-4 w-4 text-muted-foreground" />
                            <div className="flex flex-1 flex-col">
                              <span className="font-medium text-sm">
                                {wallet.name}
                              </span>
                              <span className="text-muted-foreground text-xs">
                                {Intl.NumberFormat('vi-VN', {
                                  style: 'currency',
                                  currency: 'VND',
                                  minimumFractionDigits: 0,
                                  maximumFractionDigits: 0,
                                }).format(wallet.balance || 0)}
                              </span>
                            </div>
                          </div>
                        </CommandItem>
                      );
                    })}
                </CommandGroup>
              )}

              {hasActiveFilters && (
                <>
                  <CommandSeparator />
                  <CommandGroup>
                    <CommandItem
                      onSelect={clearAllFilters}
                      className="cursor-pointer justify-center text-center text-destructive"
                    >
                      <X className="mr-2 h-4 w-4" />
                      {t('common.clear_all_filters')}
                    </CommandItem>
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
