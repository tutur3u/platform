'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2 } from '@tuturuuu/icons';
import { createClient } from '@tuturuuu/supabase/next/client';
import WorkspaceSettingsForm from '../../../app/[locale]/(dashboard)/[wsId]/inventory/promotions/settings-form';

export default function ReferralSettings({ wsId }: { wsId: string }) {
  const supabase = createClient();

  const { data: settings, isLoading: isLoadingSettings } = useQuery({
    queryKey: ['workspace-settings', wsId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workspace_settings')
        .select('*')
        .eq('ws_id', wsId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: regularPromotions, isLoading: isLoadingPromotions } = useQuery({
    queryKey: ['workspace-promotions', wsId, 'regular'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workspace_promotions')
        .select('id, name, code, value, use_ratio')
        .eq('ws_id', wsId)
        .neq('promo_type', 'REFERRAL');
      if (error) throw error;
      return data;
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
      regularPromotions={regularPromotions || []}
    />
  );
}
