'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Settings,
  User,
  UserMinus,
  UserPlus,
} from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Alert, AlertDescription, AlertTitle } from '@tuturuuu/ui/alert';
import { Avatar, AvatarImage } from '@tuturuuu/ui/avatar';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { Combobox, type ComboboxOptions } from '@tuturuuu/ui/custom/combobox';
import { Separator } from '@tuturuuu/ui/separator';
import { toast } from '@tuturuuu/ui/sonner';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

interface ReferralSectionClientProps {
  wsId: string;
  userId: string;
  canUpdateUsers: boolean;
  workspaceSettings: {
    referral_count_cap: number;
    referral_increment_percent: number;
  } | null;
  initialAvailableUsers: WorkspaceUser[];
  initialAvailableUsersCount: number;
  initialReferredUsers: WorkspaceUser[];
}

export default function ReferralSectionClient({
  wsId,
  userId,
  canUpdateUsers,
  workspaceSettings,
  initialAvailableUsers,
  initialAvailableUsersCount,
  initialReferredUsers,
}: ReferralSectionClientProps) {
  const t = useTranslations('user-data-table');
  const [selectedUserId, setSelectedUserId] = useState<string>('');

  const supabase = createClient();
  const queryClient = useQueryClient();

  // Single query: fetch all available users via RPC, hydrate with SSR data
  const availableUsersQuery = useQuery({
    queryKey: ['ws', wsId, 'users', 'available-for-referral', userId],
    queryFn: async (): Promise<{ data: WorkspaceUser[]; count: number }> => {
      const { data: rows, error } = await supabase.rpc(
        'get_available_referral_users',
        {
          p_ws_id: wsId,
          p_user_id: userId,
        }
      );
      if (error) throw error;
      const data = (rows || []).map((r) => ({
        id: r.id,
        full_name: r.full_name,
        display_name: r.display_name,
        email: r.email,
        phone: r.phone,
      })) as WorkspaceUser[];
      return { data, count: data.length };
    },
    initialData: {
      data: initialAvailableUsers,
      count: initialAvailableUsersCount,
    },
    staleTime: 5 * 60 * 1000,
  });

  // React Query for current referral count
  const currentReferralsQuery = useQuery({
    queryKey: ['ws', wsId, 'user', userId, 'referrals', 'count'],
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('workspace_users')
        .select('id', { count: 'exact' })
        .eq('ws_id', wsId)
        .eq('referred_by', userId)
        .eq('archived', false);

      if (error) throw error;
      return count || 0;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch detailed list of users referred by current user for display
  const referredUsersQuery = useQuery({
    queryKey: ['ws', wsId, 'user', userId, 'referrals', 'list'],
    queryFn: async (): Promise<WorkspaceUser[]> => {
      const { data, error } = await supabase
        .from('workspace_users')
        .select('id, full_name, display_name, email, phone')
        .eq('ws_id', wsId)
        .eq('referred_by', userId)
        .eq('archived', false)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as WorkspaceUser[];
    },
    initialData: initialReferredUsers,
    staleTime: 5 * 60 * 1000,
  });

  const userOptions: ComboboxOptions[] = useMemo(
    () =>
      (availableUsersQuery.data?.data || []).map((user) => ({
        value: user.id,
        label: `${user.full_name || user.display_name || t('common.unknown')} ${
          user.email || user.phone ? `(${user.email || user.phone})` : ''
        }`,
      })),
    [availableUsersQuery.data?.data, t]
  );

  // Keep selected option valid: if the selected user disappears from available list, reset selection
  useEffect(() => {
    if (!selectedUserId) return;
    const ids = new Set(
      (availableUsersQuery.data?.data || []).map((u) => u.id)
    );
    if (!ids.has(selectedUserId)) {
      setSelectedUserId('');
    }
  }, [availableUsersQuery.data?.data, selectedUserId]);

  const isSelectedValid = useMemo(() => {
    if (!selectedUserId) return false;
    return (availableUsersQuery.data?.data || []).some(
      (u) => u.id === selectedUserId
    );
  }, [selectedUserId, availableUsersQuery.data?.data]);

  const currentReferralCount = currentReferralsQuery.data || 0;

  const referUserMutation = useMutation({
    mutationFn: async (referredUserId: string) => {
      // Prevent duplicate referral: ensure this user is still in the available list
      const stillAvailable = (availableUsersQuery.data?.data || []).some(
        (u) => u.id === referredUserId
      );
      if (!stillAvailable) {
        throw new Error(t('user_already_referred'));
      }

      // 1) Ensure referrer-owned referral promotion exists
      const { data: existingPromo, error: promoFetchErr } = await supabase
        .from('workspace_promotions')
        .select('id')
        .eq('ws_id', wsId)
        .eq('promo_type', 'REFERRAL')
        .eq('owner_id', userId)
        .maybeSingle();
      if (promoFetchErr) throw promoFetchErr;

      // Resolve current workspace virtual user id for auditing fields
      let creatorVirtualUserId: string | null = null;
      try {
        const { data: userData, error: userError } =
          await supabase.auth.getUser();
        if (userError) throw userError;
        if (userData?.user?.id) {
          const { data: creatorRow, error: creatorIdErr } = await supabase
            .from('workspace_user_linked_users')
            .select('virtual_user_id')
            .eq('ws_id', wsId)
            .eq('platform_user_id', userData.user.id)
            .maybeSingle();
          if (creatorIdErr) throw creatorIdErr;
          creatorVirtualUserId = creatorRow?.virtual_user_id ?? null;
        }
      } catch (_error) {
        // If we fail to resolve the virtual user id, proceed without it
        creatorVirtualUserId = null;
      }

      // Require a valid creatorVirtualUserId; otherwise, do nothing.
      if (!creatorVirtualUserId) {
        throw new Error(t('missing_creator_id'));
      }

      // Create a referrer-owned referral promotion only when we have a
      // platform user mapped to a virtual user (creatorVirtualUserId).
      if (!existingPromo) {
        const { error: promoInsertErr } = await supabase
          .from('workspace_promotions')
          .insert({
            ws_id: wsId,
            owner_id: userId,
            promo_type: 'REFERRAL',
            value: 0,
            code: 'REF',
            name: 'Referral',
            description: 'Referral Code for Referral System',
            use_ratio: true,
            creator_id: creatorVirtualUserId,
          })
          .select('id')
          .single();
        if (promoInsertErr) throw promoInsertErr;
      }

      // 2) Set referred_by for the selected user
      const { error: updateErr } = await supabase
        .from('workspace_users')
        .update({ referred_by: userId, updated_by: creatorVirtualUserId })
        .eq('id', referredUserId)
        .eq('ws_id', wsId);
      if (updateErr) throw updateErr;

      // 3) Link workspace default referral promotion to referred user (if configured)
      const { data: wsSettings, error: settingsErr } = await supabase
        .from('workspace_settings')
        .select('referral_promotion_id')
        .eq('ws_id', wsId)
        .maybeSingle();
      if (settingsErr) throw settingsErr;

      const promoIdToLink = wsSettings?.referral_promotion_id || null;
      if (promoIdToLink) {
        const { error: linkErr } = await supabase
          .from('user_linked_promotions')
          .upsert(
            { user_id: referredUserId, promo_id: promoIdToLink },
            { onConflict: 'user_id,promo_id' }
          );
        if (linkErr) throw linkErr;
      }

      return referredUserId;
    },
    onSuccess: async (referredUserId) => {
      toast.success(t('referral_success'));
      setSelectedUserId('');

      // Optimistic cache updates
      await queryClient.setQueryData(
        ['ws', wsId, 'users', 'available-for-referral', userId],
        (prev: { data: WorkspaceUser[]; count: number } | undefined) => {
          if (!prev) return prev as any;
          const data = prev.data.filter((u) => u.id !== referredUserId);
          return { data, count: data.length };
        }
      );

      await queryClient.setQueryData(
        ['ws', wsId, 'user', userId, 'referrals', 'count'],
        (prev: number | undefined) =>
          typeof prev === 'number' ? prev + 1 : undefined
      );

      // Invalidate to reconcile with server
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['ws', wsId, 'users', 'available-for-referral', userId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['ws', wsId, 'user', userId, 'referrals', 'count'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['ws', wsId, 'user', userId, 'referrals', 'list'],
        }),
        // Also refresh linked promotions for this user, since we may have
        // upserted the workspace's default referral promotion
        queryClient.invalidateQueries({
          queryKey: ['user-linked-promotions', wsId, userId],
        }),
        // Refresh linked promotions for this user in the invoice page
        queryClient.invalidateQueries({
          queryKey: ['user-linked-promotions', userId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['user-referral-discounts', wsId, userId],
        }),
      ]);
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error ? error.message : t('common.error');
      toast.error(message);
    },
  });

  const unreferUserMutation = useMutation({
    mutationFn: async (referredUserId: string) => {
      // Resolve current workspace virtual user id for auditing fields
      let updaterVirtualUserId: string | null = null;
      try {
        const { data: userData, error: userError } =
          await supabase.auth.getUser();
        if (userError) throw userError;
        if (userData?.user?.id) {
          const { data: updaterRow, error: updaterIdErr } = await supabase
            .from('workspace_user_linked_users')
            .select('virtual_user_id')
            .eq('ws_id', wsId)
            .eq('platform_user_id', userData.user.id)
            .maybeSingle();
          if (updaterIdErr) throw updaterIdErr;
          updaterVirtualUserId = updaterRow?.virtual_user_id ?? null;
        }
      } catch (_error) {
        // If we fail to resolve the virtual user id, proceed without it
        updaterVirtualUserId = null;
      }

      // Require a valid updaterVirtualUserId; otherwise, do nothing.
      if (!updaterVirtualUserId) {
        throw new Error(t('missing_updater_id'));
      }

      // 1) Remove referred_by relationship
      const { error: updateErr } = await supabase
        .from('workspace_users')
        .update({ referred_by: null, updated_by: updaterVirtualUserId })
        .eq('id', referredUserId)
        .eq('ws_id', wsId)
        .eq('referred_by', userId); // Ensure they were referred by this user

      if (updateErr) throw updateErr;

      // 2) Remove linked referral promotion if it exists and is the default workspace referral promotion
      const { data: wsSettings, error: settingsErr } = await supabase
        .from('workspace_settings')
        .select('referral_promotion_id')
        .eq('ws_id', wsId)
        .maybeSingle();
      if (settingsErr) throw settingsErr;

      const promoIdToRemove = wsSettings?.referral_promotion_id || null;
      if (promoIdToRemove) {
        const { error: unlinkErr } = await supabase
          .from('user_linked_promotions')
          .delete()
          .eq('user_id', referredUserId)
          .eq('promo_id', promoIdToRemove);
        if (unlinkErr) throw unlinkErr;
      }

      return referredUserId;
    },
    onSuccess: async (_referredUserId) => {
      toast.success(t('unrefer_success'));
      setSelectedUserId('');

      // Invalidate queries to refresh data from server
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ['ws', wsId, 'users', 'available-for-referral', userId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['ws', wsId, 'user', userId, 'referrals', 'count'],
        }),
        queryClient.invalidateQueries({
          queryKey: ['ws', wsId, 'user', userId, 'referrals', 'list'],
        }),
        // Also refresh linked promotions for this user, since we may have
        // removed the workspace's default referral promotion
        queryClient.invalidateQueries({
          queryKey: ['user-linked-promotions', wsId, userId],
        }),
        // Refresh linked promotions for this user in the invoice page
        queryClient.invalidateQueries({
          queryKey: ['user-linked-promotions', userId],
        }),
        queryClient.invalidateQueries({
          queryKey: ['user-referral-discounts', wsId, userId],
        }),
      ]);
    },
    onError: (error: unknown) => {
      const message =
        error instanceof Error ? error.message : t('common.error');
      toast.error(message);
    },
  });

  const handleReferUser = async () => {
    if (!selectedUserId || referUserMutation.isPending) return;
    await referUserMutation.mutateAsync(selectedUserId);
  };

  const handleUnreferUser = async (referredUserId: string) => {
    if (unreferUserMutation.isPending) return;
    await unreferUserMutation.mutateAsync(referredUserId);
  };

  if (!workspaceSettings) {
    return (
      <div className="h-full rounded-lg border p-4">
        <Alert className="border-dynamic-red/30 bg-dynamic-red/10 text-dynamic-red">
          <div className="flex items-start gap-3">
            <Settings className="mt-0.5 h-5 w-5" />
            <div className="flex-1">
              <AlertTitle>{t('referral_settings_title')}</AlertTitle>
              <AlertDescription>{t('referral_settings_desc')}</AlertDescription>
            </div>
            <Link href={`/${wsId}/inventory/promotions`}>
              <Button
                size="xs"
                className="border border-dynamic-red/30 bg-dynamic-red/10 text-dynamic-red hover:bg-dynamic-red/15"
              >
                <ArrowRight className="h-4 w-4" />
                {t('configure_in_promotions_cta')}
              </Button>
            </Link>
          </div>
        </Alert>
      </div>
    );
  }

  const canReferMore =
    currentReferralCount < workspaceSettings.referral_count_cap;
  const remainingReferrals =
    workspaceSettings.referral_count_cap - currentReferralCount;

  return (
    <div className="h-full rounded-lg border p-4">
      <div className="grid h-full content-start gap-2">
        <div className="font-semibold text-lg">
          {t('refer_people_with_progress', {
            current: currentReferralCount,
            max: workspaceSettings.referral_count_cap,
          })}
        </div>
        <Separator />

        <div className="space-y-4">
          <div className="text-sm opacity-60">
            {t('refer_summary', {
              cap: workspaceSettings.referral_count_cap,
              percent: workspaceSettings.referral_increment_percent,
            })}
          </div>

          {/* Referred users list as cards (placed above selector) */}
          {currentReferralCount > 0 && (
            <div className="space-y-2">
              <div className="font-medium">{t('referred_users_label')}</div>
              {referredUsersQuery.isLoading ? (
                <div className="text-sm opacity-60">{t('loading')}</div>
              ) : (referredUsersQuery.data || []).length === 0 ? (
                <div className="text-sm opacity-60">
                  {t('no_referred_users')}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {(referredUsersQuery.data || []).map((u) => {
                    const hasAvatar = Boolean(u.avatar_url);
                    return (
                      <Card
                        className="p-3 transition duration-200 hover:border-foreground hover:bg-foreground/5"
                        key={u.id}
                      >
                        <CardContent className="p-0">
                          <div className="flex items-center justify-between">
                            <Link
                              href={`/${wsId}/users/database/${u.id}`}
                              className="flex-1"
                            >
                              <div className="flex items-center gap-3">
                                {hasAvatar ? (
                                  <Avatar className="h-8 w-8">
                                    <AvatarImage
                                      src={u.avatar_url as string}
                                      alt={
                                        u.display_name ||
                                        u.full_name ||
                                        t('avatar')
                                      }
                                    />
                                  </Avatar>
                                ) : (
                                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-dynamic-blue/10">
                                    <User className="h-4 w-4 text-dynamic-blue" />
                                  </div>
                                )}
                                <div className="font-medium">
                                  {u.display_name ||
                                    u.full_name ||
                                    t('common.unknown')}
                                </div>
                              </div>
                            </Link>
                            {canUpdateUsers && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  handleUnreferUser(u.id);
                                }}
                                disabled={unreferUserMutation.isPending}
                                className="h-8 w-8 p-0 text-dynamic-red hover:bg-dynamic-red/10 hover:text-dynamic-red"
                                title={t('unrefer_person')}
                                aria-label={t('unrefer_person')}
                              >
                                <UserMinus
                                  className="h-4 w-4"
                                  aria-hidden="true"
                                />
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {canUpdateUsers ? (
            canReferMore ? (
              <>
                <div className="space-y-2">
                  <label htmlFor="user-select" className="font-medium text-sm">
                    {t('select_person_to_refer_with_remaining', {
                      remaining: remainingReferrals,
                    })}
                  </label>
                  <Combobox
                    t={t}
                    options={userOptions}
                    selected={selectedUserId}
                    onChange={(value) => setSelectedUserId(value as string)}
                    placeholder={t('search_person_to_refer_placeholder')}
                  />
                  {/* No pagination */}
                </div>

                <Button
                  onClick={handleReferUser}
                  disabled={!isSelectedValid || referUserMutation.isPending}
                  className="w-full"
                >
                  <UserPlus className="mr-2 h-4 w-4" />
                  {t('refer_selected_person')}
                </Button>
              </>
            ) : (
              <div className="flex w-full flex-1 items-center justify-center py-8 text-center opacity-60">
                {t('reached_max_referrals', {
                  cap: workspaceSettings.referral_count_cap,
                })}
              </div>
            )
          ) : (
            <div className="flex w-full flex-1 items-center justify-center py-8 text-center opacity-60">
              {t('no_permission_to_refer')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
