'use client';

import { TicketPercent, Users } from '@tuturuuu/icons';
import type { ProductPromotion } from '@tuturuuu/types/primitives/ProductPromotion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useTranslations } from 'next-intl';
import { parseAsStringLiteral, useQueryState } from 'nuqs';
import { PromotionRows } from './promotion-rows';
import { PromotionsSummary } from './promotions-summary';
import { ReferralProgramPanel } from './referral-program-panel';

const promotionSections = ['campaigns', 'referrals'] as const;

export function PromotionsWorkspacePanel({
  promotions,
  wsId,
}: {
  promotions: ProductPromotion[];
  wsId: string;
}) {
  const t = useTranslations('inventory.operator.promotions.sections');
  const [section, setSection] = useQueryState(
    'section',
    parseAsStringLiteral(promotionSections)
      .withDefault('campaigns')
      .withOptions({ shallow: true })
  );
  const sections = [
    { icon: TicketPercent, label: t('campaigns'), value: 'campaigns' },
    { icon: Users, label: t('referrals'), value: 'referrals' },
  ] as const;

  return (
    <div className="grid gap-4">
      <PromotionsSummary promotions={promotions} />
      <Tabs
        className="gap-4"
        onValueChange={(value) =>
          void setSection(value as (typeof promotionSections)[number])
        }
        value={section}
      >
        <TabsList
          aria-label={t('label')}
          className="grid h-auto w-full grid-cols-2"
        >
          {sections.map(({ icon: Icon, label, value }) => (
            <TabsTrigger className="gap-2 py-2" key={value} value={value}>
              <Icon className="size-4" />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="campaigns">
          <PromotionRows rows={promotions} wsId={wsId} />
        </TabsContent>
        <TabsContent value="referrals">
          <ReferralProgramPanel promotions={promotions} wsId={wsId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
