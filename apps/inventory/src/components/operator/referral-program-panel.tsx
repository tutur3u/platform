'use client';

import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Users } from '@tuturuuu/icons';
import { getWorkspaceReferralSettings } from '@tuturuuu/internal-api/promotions';
import type { ProductPromotion } from '@tuturuuu/types/primitives/ProductPromotion';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { CONTACTS_APP_URL } from '@/constants/common';
import { StatePanel } from './operator-shell';
import { CompactEditButton, ReadOnlyField } from './payment-read-only-fields';
import { ReferralProgramEditor } from './referral-program-editor';

export function ReferralProgramPanel({
  promotions,
  wsId,
}: {
  promotions: ProductPromotion[];
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.promotions.referral');
  const [isEditing, setIsEditing] = useState(false);
  const settingsQuery = useQuery({
    queryFn: () => getWorkspaceReferralSettings(wsId),
    queryKey: ['inventory', wsId, 'referral-settings'],
  });
  const settings = settingsQuery.data?.data ?? null;

  if (settingsQuery.isPending) {
    return <ReferralProgramSkeleton />;
  }

  if (settingsQuery.isError) {
    return (
      <StatePanel
        actionLabel={t('retry')}
        description={t('loadingErrorDescription')}
        onAction={() => settingsQuery.refetch()}
        title={t('loadingError')}
        tone="danger"
      />
    );
  }

  const promotion = promotions.find(
    (candidate) => candidate.id === settings?.referral_promotion_id
  );
  const rewardLabels = {
    BOTH: t('rewardTypes.both'),
    RECEIVER: t('rewardTypes.receiver'),
    REFERRER: t('rewardTypes.referrer'),
  };
  const countCap = settings?.referral_count_cap ?? 3;
  const incrementPercent = settings?.referral_increment_percent ?? 5;

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Users className="size-4" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold">{t('title')}</h2>
                <Badge variant={settings ? 'secondary' : 'outline'}>
                  {settings ? t('configured') : t('usingDefaults')}
                </Badge>
              </div>
              <p className="mt-1 text-muted-foreground text-sm">
                {t('description')}
              </p>
            </div>
          </div>
          <CompactEditButton
            editing={isEditing}
            label={isEditing ? t('cancelEditing') : t('editSettings')}
            onClick={() => setIsEditing((current) => !current)}
          />
        </div>

        {isEditing ? (
          <ReferralProgramEditor
            key={settings?.id ?? 'defaults'}
            onSaved={() => setIsEditing(false)}
            promotions={promotions}
            settings={settings}
            wsId={wsId}
          />
        ) : (
          <>
            <div className="mt-4 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2">
              <ReadOnlyField
                label={t('rewardType')}
                value={
                  rewardLabels[settings?.referral_reward_type ?? 'REFERRER']
                }
              />
              <ReadOnlyField
                label={t('defaultPromotion')}
                value={promotion?.name ?? t('noPromotion')}
              />
              <ReadOnlyField label={t('countCap')} value={countCap} />
              <ReadOnlyField
                label={t('incrementPercent')}
                value={`${incrementPercent}%`}
              />
            </div>
            <p className="mt-3 text-muted-foreground text-xs">
              {t('readOnlyHint')}
            </p>
          </>
        )}
      </section>

      <aside className="flex flex-col justify-between gap-5 rounded-xl border border-border bg-muted/30 p-5">
        <div>
          <p className="font-semibold text-sm">{t('membersTitle')}</p>
          <p className="mt-2 text-muted-foreground text-sm">
            {t('membersDescription')}
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <a
            href={`${CONTACTS_APP_URL}/${wsId}/users/database`}
            rel="noreferrer"
            target="_blank"
          >
            {t('manageMembers')}
            <ExternalLink className="size-3.5" />
          </a>
        </Button>
      </aside>
    </div>
  );
}

function ReferralProgramSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center gap-3">
        <Skeleton className="size-9 rounded-lg" />
        <div className="grid flex-1 gap-2">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-72 max-w-full" />
        </div>
      </div>
      <Skeleton className="mt-5 h-28 w-full rounded-lg" />
    </div>
  );
}
