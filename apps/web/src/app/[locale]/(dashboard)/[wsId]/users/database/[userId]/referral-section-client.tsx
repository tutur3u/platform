'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Settings,
  User,
  UserMinus,
  UserPlus,
} from '@tuturuuu/icons';
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
    referral_reward_type: 'REFERRER' | 'RECEIVER' | 'BOTH';
    referral_promotion_id: string | null;
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

  const queryClient = useQueryClient();

  // Single query: fetch all available users via RPC, hydrate with SSR data
  const availableUsersQuery = useQuery({
    queryKey: ['ws', wsId, 'users', 'available-for-referral', userId],
    queryFn: async (): Promise<{ data: WorkspaceUser[]; count: number }> => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/users/${userId}/referrals?type=available`,
        { cache: 'no-store' }
      );
      if (!response.ok) throw new Error('Failed to fetch available users');
      const data = await response.json();
      const users = (Array.isArray(data) ? data : []) as WorkspaceUser[];
      return { data: users, count: users.length };
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
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/users/${userId}/referrals`,
        { cache: 'no-store' }
      );
      if (!response.ok) throw new Error('Failed to fetch referral count');
      const data = await response.json();
      return (data?.count || 0) as number;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch detailed list of users referred by current user for display
  const referredUsersQuery = useQuery({
    queryKey: ['ws', wsId, 'user', userId, 'referrals', 'list'],
    queryFn: async (): Promise<WorkspaceUser[]> => {
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/users/${userId}/referrals`,
        { cache: 'no-store' }
      );
      if (!response.ok) throw new Error('Failed to fetch referred users');
      const data = await response.json();
      return (Array.isArray(data?.data) ? data.data : []) as WorkspaceUser[];
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
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/users/${userId}/referrals`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ referredUserId }),
        }
      );
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error?.message || 'Failed to refer user');
      }
      return referredUserId;
    },
    onSuccess: async (referredUserId) => {
      toast.success(t('referral_success'));
      setSelectedUserId('');

      // Optimistic cache updates
      await queryClient.setQueryData(
        ['ws', wsId, 'users', 'available-for-referral', userId],
        (
          prev: { data: WorkspaceUser[]; count: number } | undefined
        ): { data: WorkspaceUser[]; count: number } | undefined => {
          if (!prev) return prev;
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
        // Also refresh linked promotions for this user
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
      const response = await fetch(
        `/api/v1/workspaces/${wsId}/users/${userId}/referrals?referredUserId=${referredUserId}`,
        {
          method: 'DELETE',
        }
      );
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error?.message || 'Failed to remove referral');
      }
      return referredUserId;
    },
    onSuccess: async (referredUserId) => {
      toast.success(t('unrefer_success'));
      setSelectedUserId('');

      // Optimistic cache updates
      await queryClient.setQueryData(
        ['ws', wsId, 'users', 'available-for-referral', userId],
        (
          prev: { data: WorkspaceUser[]; count: number } | undefined
        ): { data: WorkspaceUser[]; count: number } | undefined => {
          if (!prev) return prev;
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
