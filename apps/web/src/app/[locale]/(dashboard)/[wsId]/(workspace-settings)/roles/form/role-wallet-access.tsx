'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, Loader2, Search, Trash2 } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { WorkspaceRoleWalletWhitelist } from '@tuturuuu/types/primitives/WorkspaceRoleWalletWhitelist';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@tuturuuu/ui/alert-dialog';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { viewingWindowOptions } from '@tuturuuu/ui/finance/wallets/wallet-form-schema';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { AddWalletDialog } from './add-wallet-dialog';
import type { SectionProps } from './index';

export default function RoleFormWalletAccessSection({
  wsId,
  roleId,
}: SectionProps) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [pendingViewingWindows, setPendingViewingWindows] = useState<
    Record<string, string>
  >({});

  const whitelistedWalletsQuery = useQuery({
    queryKey: ['workspaces', wsId, 'roles', roleId, 'wallets'],
    queryFn: roleId ? () => getWhitelistedWallets(wsId, roleId) : undefined,
    enabled: !!roleId,
  });

  const availableWalletsQuery = useQuery({
    queryKey: ['workspaces', wsId, 'wallets'],
    queryFn: () => getAvailableWallets(wsId),
  });

  const whitelistedWallets = whitelistedWalletsQuery.data || [];
  const allWallets = availableWalletsQuery.data || [];

  // Filter whitelisted wallets based on search
  const filteredWhitelistedWallets = useMemo(() => {
    if (!searchQuery) return whitelistedWallets;

    const query = searchQuery.toLowerCase().trim();
    return whitelistedWallets.filter((item: WorkspaceRoleWalletWhitelist) => {
      const wallet = item.workspace_wallets;
      return wallet?.name?.toLowerCase().includes(query);
    });
  }, [whitelistedWallets, searchQuery]);

  // Get wallets not yet whitelisted
  const availableWallets = useMemo(() => {
    const whitelistedIds = new Set(
      whitelistedWallets.map(
        (item: WorkspaceRoleWalletWhitelist) => item.wallet_id
      )
    );
    return allWallets.filter((w) => !whitelistedIds.has(w.id));
  }, [allWallets, whitelistedWallets]);

  const updateWalletMutation = useMutation({
    mutationFn: async ({
      walletId,
      data,
    }: {
      walletId: string;
      data: { viewing_window: string; custom_days?: number };
    }) => {
      const res = await fetch(
        `/api/v1/workspaces/${wsId}/roles/${roleId}/wallets/${walletId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        }
      );

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to update wallet');
      }

      return res.json();
    },
    onSuccess: (_data, variables) => {
      toast.success(t('ws-roles.wallet_updated_successfully'));
      queryClient.invalidateQueries({
        queryKey: ['workspaces', wsId, 'roles', roleId, 'wallets'],
      });
      setPendingViewingWindows((current) => {
        if (!variables?.walletId) return current;
        const next = { ...current };
        delete next[variables.walletId];
        return next;
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || t('ws-roles.failed_to_update_wallet'));
    },
  });

  const deleteWalletMutation = useMutation({
    mutationFn: async (walletId: string) => {
      const res = await fetch(
        `/api/v1/workspaces/${wsId}/roles/${roleId}/wallets/${walletId}`,
        {
          method: 'DELETE',
        }
      );

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to remove wallet');
      }
    },
    onSuccess: () => {
      toast.success(t('ws-roles.wallet_removed_successfully'));
      queryClient.invalidateQueries({
        queryKey: ['workspaces', wsId, 'roles', roleId, 'wallets'],
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || t('ws-roles.failed_to_remove_wallet'));
    },
  });

  const handleUpdateWindow = (
    walletId: string,
    window: string,
    days?: number
  ) => {
    updateWalletMutation.mutate({
      walletId,
      data: {
        viewing_window: window,
        custom_days: window === 'custom' ? days : undefined,
      },
    });
  };

  const getEffectiveViewingWindow = (item: WorkspaceRoleWalletWhitelist) =>
    pendingViewingWindows[item.wallet_id] ?? item.viewing_window;

  const getViewingWindowLabel = (window: string, customDays?: number) => {
    const option = viewingWindowOptions.find((opt) => opt.value === window);
    if (window === 'custom' && customDays) {
      return t('ws-roles.viewing_window_custom_days', { days: customDays });
    }
    return option ? t(option.labelKey) : window;
  };

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 rounded-lg border border-dynamic-blue/20 bg-linear-to-br from-dynamic-blue/5 via-dynamic-blue/10 to-dynamic-purple/5 p-3 shadow-sm sm:flex-row sm:items-center sm:p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-dynamic-blue/20 sm:h-12 sm:w-12">
          <Banknote className="h-5 w-5 text-dynamic-blue sm:h-6 sm:w-6" />
        </div>
        <div className="flex-1">
          <div className="font-semibold text-foreground/60 text-sm">
            {t('ws-roles.wallet_access')}
          </div>
          <div className="font-bold text-base text-dynamic-blue sm:text-lg">
            {t('ws-roles.wallet_access_description')}
          </div>
        </div>
        <Badge
          variant="secondary"
          className="h-fit px-3 py-1.5 text-sm sm:text-base"
        >
          {whitelistedWallets.length}{' '}
          {whitelistedWallets.length === 1
            ? t('ws-roles.wallet')
            : t('ws-roles.wallets')}
        </Badge>
      </div>

      {/* Add Wallet Dialog */}
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-2 font-semibold text-base">
          <Banknote className="h-4 w-4" />
          {t('ws-roles.whitelisted_wallets')} (
          {filteredWhitelistedWallets.length})
        </Label>
        {roleId && (
          <AddWalletDialog
            wsId={wsId}
            roleId={roleId}
            availableWallets={availableWallets}
          />
        )}
      </div>

      {/* Search */}
      {whitelistedWallets.length > 0 && (
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('ws-roles.search_wallets_placeholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-10 pl-9 sm:h-11"
          />
        </div>
      )}

      <Separator />

      {/* Whitelisted Wallets List */}
      {filteredWhitelistedWallets.length > 0 ? (
        <div className="space-y-2">
          {filteredWhitelistedWallets.map(
            (item: WorkspaceRoleWalletWhitelist) => {
              const wallet = item.workspace_wallets;
              if (!wallet) return null;

              return (
                <div
                  key={item.id}
                  className="flex flex-col gap-2 rounded-lg border bg-background p-3 transition-colors hover:bg-accent/50 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                >
                  <div className="flex flex-1 items-center gap-2.5 sm:gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-dynamic-blue/20 sm:h-12 sm:w-12">
                      <Banknote className="h-5 w-5 text-dynamic-blue sm:h-6 sm:w-6" />
                    </div>
                    <div className="min-w-0 flex-1 overflow-hidden">
                      <div className="truncate font-semibold text-sm sm:text-base">
                        {wallet.name || t('common.unnamed')}
                      </div>
                      <div className="truncate text-muted-foreground text-xs sm:text-sm">
                        {getViewingWindowLabel(
                          getEffectiveViewingWindow(item),
                          item.custom_days ?? undefined
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      value={getEffectiveViewingWindow(item)}
                      onValueChange={(value) => {
                        if (value === 'custom') {
                          setPendingViewingWindows((current) => ({
                            ...current,
                            [item.wallet_id]: 'custom',
                          }));
                          return;
                        }

                        setPendingViewingWindows((current) => {
                          const next = { ...current };
                          delete next[item.wallet_id];
                          return next;
                        });
                        handleUpdateWindow(item.wallet_id, value, undefined);
                      }}
                    >
                      <SelectTrigger className="w-35">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {viewingWindowOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {t(option.labelKey)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {getEffectiveViewingWindow(item) === 'custom' && (
                      <Input
                        type="number"
                        min="1"
                        placeholder={t('ws-roles.custom_days_placeholder')}
                        defaultValue={item.custom_days ?? ''}
                        className="w-20"
                        onBlur={(e) => {
                          const days = parseInt(e.target.value, 10);
                          if (!Number.isNaN(days) && days >= 1) {
                            handleUpdateWindow(item.wallet_id, 'custom', days);
                          } else if (e.target.value) {
                            toast.error(
                              t('ws-roles.custom_days_must_be_at_least_1')
                            );
                            e.target.value = String(item.custom_days ?? '');
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.currentTarget.blur();
                          }
                        }}
                      />
                    )}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          disabled={deleteWalletMutation.isPending}
                        >
                          {deleteWalletMutation.isPending &&
                          deleteWalletMutation.variables === item.wallet_id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin sm:h-4 sm:w-4" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                          )}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            {t('ws-roles.confirm_remove_wallet')}
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            {t('ws-roles.remove_wallet_description')}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>
                            {t('common.cancel')}
                          </AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() =>
                              deleteWalletMutation.mutate(item.wallet_id)
                            }
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            {t('common.remove')}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              );
            }
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed bg-muted/30 p-6 text-center sm:p-8">
          <Banknote className="mx-auto mb-2 h-10 w-10 text-muted-foreground sm:mb-3 sm:h-12 sm:w-12" />
          <p className="mb-1 font-semibold text-sm sm:mb-2 sm:text-base">
            {searchQuery
              ? t('ws-roles.no_wallets_match_search')
              : t('ws-roles.no_wallets_whitelisted')}
          </p>
          <p className="text-muted-foreground text-xs sm:text-sm">
            {searchQuery
              ? t('ws-roles.try_different_search_term')
              : t('ws-roles.add_wallets_to_get_started')}
          </p>
        </div>
      )}
    </div>
  );
}

async function getWhitelistedWallets(
  wsId: string,
  roleId: string
): Promise<WorkspaceRoleWalletWhitelist[]> {
  const res = await fetch(`/api/v1/workspaces/${wsId}/roles/${roleId}/wallets`);
  if (!res.ok) throw new Error('Failed to fetch whitelisted wallets');
  return res.json() as Promise<WorkspaceRoleWalletWhitelist[]>;
}

async function getAvailableWallets(wsId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('workspace_wallets')
    .select('id, name, balance, currency, type')
    .eq('ws_id', wsId)
    .order('name', { ascending: true });

  if (error) throw error;
  return data || [];
}
