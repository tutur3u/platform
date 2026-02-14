'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';

interface FeatureAccess {
  id: string;
  tier: string;
  feature: string;
  enabled: boolean;
  max_requests_per_day: number | null;
}

const TIERS = ['FREE', 'PLUS', 'PRO', 'ENTERPRISE'] as const;

export default function FeaturesTab() {
  const t = useTranslations('ai-credits-admin');
  const queryClient = useQueryClient();

  const { data: features, isLoading } = useQuery<FeatureAccess[]>({
    queryKey: ['admin', 'ai-credits', 'features'],
    queryFn: async () => {
      const res = await fetch('/api/v1/admin/ai-credits/features');
      if (!res.ok) throw new Error('Failed to fetch features');
      return res.json();
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const res = await fetch('/api/v1/admin/ai-credits/features', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, enabled }),
      });
      if (!res.ok) throw new Error('Failed to update');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['admin', 'ai-credits', 'features'],
      });
      toast.success(t('feature_updated'));
    },
    onError: () => toast.error(t('update_failed')),
  });

  const featureNames = Array.from(
    new Set((features ?? []).map((f) => f.feature))
  ).sort();

  const getFeatureForTier = (feature: string, tier: string) =>
    (features ?? []).find((f) => f.feature === feature && f.tier === tier);

  if (isLoading) {
    return <div className="h-48 animate-pulse rounded bg-muted" />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('feature_matrix')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="pb-2 text-left font-medium">{t('feature')}</th>
                {TIERS.map((tier) => (
                  <th key={tier} className="pb-2 text-center font-medium">
                    {tier}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {featureNames.map((featureName) => (
                <tr key={featureName} className="border-b last:border-0">
                  <td className="py-3 font-mono text-xs">{featureName}</td>
                  {TIERS.map((tier) => {
                    const fa = getFeatureForTier(featureName, tier);
                    return (
                      <td key={tier} className="py-3 text-center">
                        {fa ? (
                          <Switch
                            checked={fa.enabled}
                            onCheckedChange={(checked) =>
                              toggleMutation.mutate({
                                id: fa.id,
                                enabled: checked,
                              })
                            }
                          />
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
