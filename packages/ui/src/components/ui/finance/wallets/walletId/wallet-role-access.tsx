'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Search, Shield, Trash2 } from '@tuturuuu/icons';
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
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@tuturuuu/ui/form';
import { useForm } from '@tuturuuu/ui/hooks/use-form';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { zodResolver } from '@tuturuuu/ui/resolvers';
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
import {
  roleFormSchema,
  type RoleFormValues,
  viewingWindowOptions,
} from '../wallet-form-schema';

interface Props {
  wsId: string;
  walletId: string;
}

export default function WalletRoleAccess({ wsId, walletId }: Props) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [pendingViewingWindows, setPendingViewingWindows] = useState<
    Record<string, string>
  >({});

  const roleAccessQuery = useQuery({
    queryKey: ['workspaces', wsId, 'wallets', walletId, 'roles'],
    queryFn: () => getRoleAccess(wsId, walletId),
  });

  const availableRolesQuery = useQuery({
    queryKey: ['workspaces', wsId, 'roles'],
    queryFn: () => getAvailableRoles(wsId),
  });

  const roleAccess = roleAccessQuery.data || [];
  const allRoles = availableRolesQuery.data || [];

  // Filter role access based on search
  const filteredRoleAccess = useMemo(() => {
    if (!searchQuery) return roleAccess;

    const query = searchQuery.toLowerCase().trim();
    return roleAccess.filter((item: WorkspaceRoleWalletWhitelist) => {
      const role = item.workspace_roles;
      return role?.name?.toLowerCase().includes(query);
    });
  }, [roleAccess, searchQuery]);

  // Get roles not yet having access
  const availableRoles = useMemo(() => {
    const accessRoleIds = new Set(
      roleAccess.map((item: WorkspaceRoleWalletWhitelist) => item.role_id)
    );
    return allRoles.filter((r) => !accessRoleIds.has(r.id));
  }, [allRoles, roleAccess]);

  const addRoleMutation = useMutation({
    mutationFn: async (data: RoleFormValues) => {
      const res = await fetch(
        `/api/v1/workspaces/${wsId}/wallets/${walletId}/roles`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        }
      );

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to add role');
      }

      return res.json();
    },
    onSuccess: () => {
      toast.success(t('ws-wallets.role_added_successfully'));
      queryClient.invalidateQueries({
        queryKey: ['workspaces', wsId, 'wallets', walletId, 'roles'],
      });
      setShowAddDialog(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || t('ws-wallets.failed_to_add_role'));
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({
      roleId,
      data,
    }: {
      roleId: string;
      data: { viewing_window: string; custom_days?: number };
    }) => {
      const res = await fetch(
        `/api/v1/workspaces/${wsId}/wallets/${walletId}/roles/${roleId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        }
      );

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to update role');
      }

      return res.json();
    },
    onSuccess: (_data, variables) => {
      toast.success(t('ws-wallets.role_updated_successfully'));
      queryClient.invalidateQueries({
        queryKey: ['workspaces', wsId, 'wallets', walletId, 'roles'],
      });
      setPendingViewingWindows((current) => {
        if (!variables?.roleId) return current;
        const next = { ...current };
        delete next[variables.roleId];
        return next;
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || t('ws-wallets.failed_to_update_role'));
    },
  });

  const deleteRoleMutation = useMutation({
    mutationFn: async (roleId: string) => {
      const res = await fetch(
        `/api/v1/workspaces/${wsId}/wallets/${walletId}/roles/${roleId}`,
        {
          method: 'DELETE',
        }
      );

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to remove role');
      }
    },
    onSuccess: () => {
      toast.success(t('ws-wallets.role_removed_successfully'));
      queryClient.invalidateQueries({
        queryKey: ['workspaces', wsId, 'wallets', walletId, 'roles'],
      });
    },
    onError: (error: Error) => {
      toast.error(error.message || t('ws-wallets.failed_to_remove_role'));
    },
  });

  const form = useForm<RoleFormValues>({
    resolver: zodResolver(roleFormSchema),
    defaultValues: {
      role_id: '',
      viewing_window: '1_month',
      custom_days: undefined,
    },
  });

  const viewingWindow = form.watch('viewing_window');

  const onSubmit = (data: RoleFormValues) => {
    addRoleMutation.mutate(data);
  };

  const handleUpdateWindow = (
    roleId: string,
    window: string,
    days?: number
  ) => {
    updateRoleMutation.mutate({
      roleId,
      data: {
        viewing_window: window,
        custom_days: window === 'custom' ? days : undefined,
      },
    });
  };

  const getViewingWindowLabel = (
    window: string,
    customDays?: number | null
  ) => {
    const option = viewingWindowOptions.find((opt) => opt.value === window);
    if (window === 'custom' && customDays) {
      return t('ws-roles.viewing_window_custom_days', { days: customDays });
    }
    return option ? t(option.labelKey) : window;
  };

  const getEffectiveViewingWindow = (item: WorkspaceRoleWalletWhitelist) =>
    pendingViewingWindows[item.role_id] ?? item.viewing_window;

  return (
    <div className="space-y-4">
      {/* Add Role Dialog */}
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-2 font-semibold text-base">
          <Shield className="h-4 w-4" />
          {t('ws-wallets.roles_with_access')} ({filteredRoleAccess.length})
        </Label>
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogTrigger asChild>
            <Button
              type="button"
              size="sm"
              disabled={availableRoles.length === 0}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5 sm:h-4 sm:w-4" />
              <span className="text-xs sm:text-sm">
                {t('ws-wallets.add_role')}
              </span>
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{t('ws-wallets.add_role_to_wallet')}</DialogTitle>
              <DialogDescription>
                {t('ws-wallets.add_role_to_wallet_description')}
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-4"
              >
                <FormField
                  control={form.control}
                  name="role_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('ws-wallets.role')}</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue
                              placeholder={t('ws-wallets.select_role')}
                            />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {availableRoles.map((role) => (
                            <SelectItem key={role.id} value={role.id}>
                              {role.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="viewing_window"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('ws-roles.viewing_window')}</FormLabel>
                      <Select
                        onValueChange={(value) => {
                          field.onChange(value);
                          if (value !== 'custom') {
                            form.setValue('custom_days', undefined);
                          }
                        }}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {viewingWindowOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {t(option.labelKey)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        {t('ws-roles.viewing_window_description')}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {viewingWindow === 'custom' && (
                  <FormField
                    control={form.control}
                    name="custom_days"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('ws-roles.custom_days')}</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min="1"
                            placeholder="30"
                            {...field}
                            onChange={(e) =>
                              field.onChange(
                                e.target.value
                                  ? parseInt(e.target.value, 10)
                                  : undefined
                              )
                            }
                          />
                        </FormControl>
                        <FormDescription>
                          {t('ws-roles.custom_days_description')}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowAddDialog(false)}
                  >
                    {t('common.cancel')}
                  </Button>
                  <Button type="submit" disabled={addRoleMutation.isPending}>
                    {addRoleMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t('common.processing')}
                      </>
                    ) : (
                      t('common.add')
                    )}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      {roleAccess.length > 0 && (
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('ws-wallets.search_roles_placeholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-10 pl-9 sm:h-11"
          />
        </div>
      )}

      <Separator />

      {/* Roles List */}
      {roleAccessQuery.isLoading || availableRolesQuery.isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filteredRoleAccess.length > 0 ? (
        <div className="space-y-2">
          {filteredRoleAccess.map((item: WorkspaceRoleWalletWhitelist) => {
            const role = item.workspace_roles;
            if (!role) return null;

            return (
              <div
                key={item.id}
                className="flex flex-col gap-2 rounded-lg border bg-background p-3 transition-colors hover:bg-accent/50 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
              >
                <div className="flex flex-1 items-center gap-2.5 sm:gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-dynamic-purple/20 sm:h-12 sm:w-12">
                    <Shield className="h-5 w-5 text-dynamic-purple sm:h-6 sm:w-6" />
                  </div>
                  <div className="min-w-0 flex-1 overflow-hidden">
                    <div className="truncate font-semibold text-sm sm:text-base">
                      {role.name || t('common.unnamed')}
                    </div>
                    <div className="truncate text-muted-foreground text-xs sm:text-sm">
                      {getViewingWindowLabel(
                        getEffectiveViewingWindow(item),
                        item.custom_days
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    value={getEffectiveViewingWindow(item)}
                    disabled={updateRoleMutation.isPending}
                    onValueChange={(value) => {
                      if (value === 'custom') {
                        setPendingViewingWindows((current) => ({
                          ...current,
                          [item.role_id]: 'custom',
                        }));
                        return;
                      }

                      setPendingViewingWindows((current) => {
                        const next = { ...current };
                        delete next[item.role_id];
                        return next;
                      });
                      handleUpdateWindow(item.role_id, value, undefined);
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
                      max="365"
                      placeholder={t('ws-roles.custom_days_placeholder')}
                      defaultValue={item.custom_days ?? ''}
                      className="w-20"
                      onBlur={(e) => {
                        const days = parseInt(e.target.value, 10);
                        if (!Number.isNaN(days) && days >= 1) {
                          handleUpdateWindow(item.role_id, 'custom', days);
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
                        disabled={deleteRoleMutation.isPending}
                      >
                        {deleteRoleMutation.isPending &&
                        deleteRoleMutation.variables === item.role_id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin sm:h-4 sm:w-4" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                        )}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>
                          {t('ws-wallets.confirm_remove_role')}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          {t('ws-wallets.remove_role_description')}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>
                          {t('common.cancel')}
                        </AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() =>
                            deleteRoleMutation.mutate(item.role_id)
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
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed bg-muted/30 p-6 text-center sm:p-8">
          <Shield className="mx-auto mb-2 h-10 w-10 text-muted-foreground sm:mb-3 sm:h-12 sm:w-12" />
          <p className="mb-1 font-semibold text-sm sm:mb-2 sm:text-base">
            {searchQuery
              ? t('ws-wallets.no_roles_match_search')
              : t('ws-wallets.no_roles_have_access')}
          </p>
          <p className="text-muted-foreground text-xs sm:text-sm">
            {searchQuery
              ? t('ws-wallets.try_different_search_term')
              : t('ws-wallets.add_roles_to_get_started')}
          </p>
        </div>
      )}
    </div>
  );
}

async function getRoleAccess(wsId: string, walletId: string) {
  const res = await fetch(
    `/api/v1/workspaces/${wsId}/wallets/${walletId}/roles`
  );
  if (!res.ok) throw new Error('Failed to fetch role access');
  return res.json();
}

async function getAvailableRoles(wsId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('workspace_roles')
    .select('id, name')
    .eq('ws_id', wsId)
    .order('name', { ascending: true });

  if (error) throw error;
  return data || [];
}
