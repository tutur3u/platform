'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2 } from '@tuturuuu/icons';
import type { Database } from '@tuturuuu/types';
import { apiFetch } from '@/lib/api-fetch';
import WorkspaceSettingsForm from '../../../app/[locale]/(dashboard)/[wsId]/inventory/promotions/settings-form';

type WorkspaceSettingsRow =
  Database['public']['Tables']['workspace_settings']['Row'];

export default function ReferralSettings({ wsId }: { wsId: string }) {
  const { data: settings, isLoading: isLoadingSettings } = useQuery({
    queryKey: ['workspace-settings', wsId],
    queryFn: () =>
      apiFetch<WorkspaceSettingsRow>(`/api/v1/workspaces/${wsId}/settings`, {
        cache: 'no-store',
      }),
  });

  const { data: regularPromotions, isLoading: isLoadingPromotions } = useQuery({
    queryKey: ['workspace-promotions', wsId, 'regular'],
    queryFn: async () => {
      const promotions = await apiFetch<
        Array<{
          id: string;
          name: string;
          code: string;
          value: number;
          use_ratio: boolean | null;
          promo_type?: string | null;
        }>
      >(`/api/v1/workspaces/${wsId}/promotions`, {
        cache: 'no-store',
      });

      return promotions.filter(
        (promotion) => promotion.promo_type !== 'REFERRAL'
      );
    },
  });

  if (isLoadingSettings || isLoadingPromotions) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <WorkspaceSettingsForm
      wsId={wsId}
      data={settings}
      regularPromotions={(regularPromotions || []).map((promotion) => ({
        ...promotion,
        use_ratio: promotion.use_ratio ?? false,
      }))}
    />
  );
}
