'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { WorkspaceReferralSettings } from '@tuturuuu/internal-api/promotions';
import { updateWorkspaceReferralSettings } from '@tuturuuu/internal-api/promotions';
import type { ProductPromotion } from '@tuturuuu/types/primitives/ProductPromotion';
import { Button } from '@tuturuuu/ui/button';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { NumberField, SelectValueField } from './operator-form-fields';
import {
  buildReferralSettingsPayload,
  isReferralProgramFormValid,
  type ReferralRewardType,
  referralProgramFormFromSettings,
} from './referral-program-form';

export function ReferralProgramEditor({
  onSaved,
  promotions,
  settings,
  wsId,
}: {
  onSaved: () => void;
  promotions: ProductPromotion[];
  settings: WorkspaceReferralSettings | null;
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.promotions.referral');
  const queryClient = useQueryClient();
  const [form, setForm] = useState(() =>
    referralProgramFormFromSettings(settings)
  );
  const mutation = useMutation({
    mutationFn: () =>
      updateWorkspaceReferralSettings(wsId, buildReferralSettingsPayload(form)),
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : t('saveError')),
    onSuccess: () => {
      toast.success(t('saveSuccess'));
      queryClient.invalidateQueries({
        queryKey: ['inventory', wsId, 'referral-settings'],
      });
      onSaved();
    },
  });
  const rewardOptions: Array<{ label: string; value: ReferralRewardType }> = [
    { label: t('rewardTypes.referrer'), value: 'REFERRER' },
    { label: t('rewardTypes.receiver'), value: 'RECEIVER' },
    { label: t('rewardTypes.both'), value: 'BOTH' },
  ];
  const promotionOptions = promotions
    .map((promotion) => ({
      label:
        promotion.name && promotion.code
          ? `${promotion.name} (${promotion.code})`
          : (promotion.name ?? promotion.code ?? t('unnamedCampaign')),
      value: promotion.id ?? '',
    }))
    .filter((option) => option.value);

  return (
    <form
      className="mt-4 grid gap-4"
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        mutation.mutate();
      }}
    >
      <div className="grid gap-3 md:grid-cols-2">
        <SelectValueField
          allowEmpty={false}
          label={t('rewardType')}
          onChange={(rewardType) =>
            setForm((current) => ({
              ...current,
              rewardType: rewardType as ReferralRewardType,
            }))
          }
          options={rewardOptions}
          placeholder={t('rewardType')}
          value={form.rewardType}
        />
        <SelectValueField
          emptyText={t('noCampaigns')}
          hint={t('defaultPromotionHint')}
          label={t('defaultPromotion')}
          onChange={(promotionId) =>
            setForm((current) => ({ ...current, promotionId }))
          }
          options={promotionOptions}
          placeholder={t('noPromotion')}
          value={form.promotionId}
        />
        <NumberField
          hint={t('countCapHint')}
          label={t('countCap')}
          onChange={(countCap) =>
            setForm((current) => ({ ...current, countCap }))
          }
          placeholder="3"
          value={form.countCap}
        />
        <NumberField
          hint={t('incrementPercentHint')}
          label={t('incrementPercent')}
          onChange={(incrementPercent) =>
            setForm((current) => ({ ...current, incrementPercent }))
          }
          placeholder="5"
          value={form.incrementPercent}
        />
      </div>
      <div className="flex justify-end">
        <Button
          disabled={mutation.isPending || !isReferralProgramFormValid(form)}
          type="submit"
        >
          {mutation.isPending ? t('saving') : t('save')}
        </Button>
      </div>
    </form>
  );
}
