'use client';

import { createClient } from '@tuturuuu/supabase/next/client';
import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import { Button } from '@tuturuuu/ui/button';
import { Combobox, type ComboboxOptions } from '@tuturuuu/ui/custom/combobox';
import { UserPlus } from '@tuturuuu/ui/icons';
import { Separator } from '@tuturuuu/ui/separator';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

interface ReferralSectionClientProps {
  wsId: string;
  userId: string;
  workspaceSettings: {
    referral_count_cap: number;
    referral_increment_percent: number;
  };
  initialAvailableUsers: WorkspaceUser[];
  initialAvailableUsersCount: number;
}

export default function ReferralSectionClient({
  wsId,
  userId,
  workspaceSettings,
  initialAvailableUsers,
  initialAvailableUsersCount,
}: ReferralSectionClientProps) {
  const t = useTranslations('user-data-table');
  const [selectedUserId, setSelectedUserId] = useState<string>('');

  const supabase = createClient();

  // React Query for available users with hydration
  const availableUsersQuery = useQuery({
    queryKey: ['ws', wsId, 'users', 'available-for-referral', userId],
    queryFn: async (): Promise<{ data: WorkspaceUser[]; count: number }> => {
      // Get current user's referrer to exclude them
      const { data: currentUserData } = await supabase
        .from('workspace_users')
        .select('referred_by')
        .eq('id', userId)
        .single();

      let queryBuilder = supabase
        .from('workspace_users')
        .select('id, full_name, display_name, email, phone', { count: 'exact' })
        .eq('ws_id', wsId)
        .eq('archived', false)
        .neq('id', userId); // Can't refer ourselves

      // Can't refer the person who referred us
      if (currentUserData?.referred_by) {
        queryBuilder = queryBuilder.neq('id', currentUserData.referred_by);
      }

      queryBuilder = queryBuilder.order('full_name', { ascending: true, nullsFirst: false });

      const { data, count, error } = await queryBuilder;
      if (error) throw error;
      return { data: data || [], count: count || 0 };
    },
    initialData: {
      data: initialAvailableUsers,
      count: initialAvailableUsersCount,
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
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
    staleTime: 1 * 60 * 1000, // 1 minute
  });

  const userOptions: ComboboxOptions[] = useMemo(
    () =>
      availableUsersQuery.data?.data?.map((user) => ({
        value: user.id,
        label: `${user.full_name || user.display_name || 'No name'} ${
          user.email || user.phone ? `(${user.email || user.phone})` : ''
        }`,
      })) || [],
    [availableUsersQuery.data?.data]
  );

  const currentReferralCount = currentReferralsQuery.data || 0;
  const canReferMore = currentReferralCount < workspaceSettings.referral_count_cap;
  const remainingReferrals = workspaceSettings.referral_count_cap - currentReferralCount;

  const handleReferUser = async () => {
    if (!selectedUserId) return;
    
    // TODO: This will be implemented with mutations in the future
    console.log('Referring user:', selectedUserId);
  };

  return (
    <div className="h-full rounded-lg border p-4">
      <div className="grid h-full gap-2 content-start">
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

          {canReferMore ? (
            <>
              <div className="space-y-2">
                <label htmlFor="user-select" className="text-sm font-medium">
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
              </div>

              <Button
                onClick={handleReferUser}
                disabled={!selectedUserId}
                className="w-full"
              >
                <UserPlus className="h-4 w-4 mr-2" />
                {t('refer_selected_person')}
              </Button>
            </>
          ) : (
            <div className="flex w-full flex-1 items-center justify-center text-center opacity-60 py-8">
              {t('reached_max_referrals', {
                cap: workspaceSettings.referral_count_cap,
              })}
            </div>
          )}

          {currentReferralCount > 0 && (
            <div className="text-sm">
              <span className="font-medium">{t('current_discount_label')}</span>{' '}
              {Math.min(
                currentReferralCount * workspaceSettings.referral_increment_percent,
                workspaceSettings.referral_count_cap * workspaceSettings.referral_increment_percent
              )}%
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
