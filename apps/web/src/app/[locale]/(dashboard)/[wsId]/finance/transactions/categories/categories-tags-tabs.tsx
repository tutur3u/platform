'use client';

import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { CategoryBreakdownChart } from '@tuturuuu/ui/finance/shared/charts/category-breakdown-chart';
import { TagManager } from '@tuturuuu/ui/finance/tags/tag-manager';
import { AmountFilterWrapper } from '@tuturuuu/ui/finance/transactions/categories/amount-filter-wrapper';
import { CategoriesDataTable } from '@tuturuuu/ui/finance/transactions/categories/categories-data-table';
import { TransactionCategoryForm } from '@tuturuuu/ui/finance/transactions/categories/form';
import { TypeFilterWrapper } from '@tuturuuu/ui/finance/transactions/categories/type-filter-wrapper';
import { Separator } from '@tuturuuu/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useTranslations } from 'next-intl';
import { parseAsString, useQueryState } from 'nuqs';

interface Props {
  wsId: string;
  currency: string;
}

export default function CategoriesTagsTabs({ wsId, currency }: Props) {
  const t = useTranslations();
  const [tab, setTab] = useQueryState(
    'tab',
    parseAsString.withDefault('categories').withOptions({
      shallow: true,
    })
  );

  const activeTab = tab === 'tags' ? 'tags' : 'categories';

  return (
    <Tabs
      value={activeTab}
      onValueChange={(nextTab) =>
        setTab(nextTab === 'categories' ? null : nextTab)
      }
      className="space-y-4"
    >
      <TabsList>
        <TabsTrigger value="categories">
          {t('ws-transaction-categories.plural')}
        </TabsTrigger>
        <TabsTrigger value="tags">
          {t('ws-transaction-tags.plural')}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="categories" className="space-y-4">
        <FeatureSummary
          pluralTitle={t('ws-transaction-categories.plural')}
          singularTitle={t('ws-transaction-categories.singular')}
          description={t('ws-transaction-categories.description')}
          createTitle={t('ws-transaction-categories.create')}
          createDescription={t('ws-transaction-categories.create_description')}
          form={<TransactionCategoryForm wsId={wsId} />}
        />
        <Separator className="my-4" />
        <CategoryBreakdownChart wsId={wsId} currency={currency} />
        <Separator className="my-4" />
        <CategoriesDataTable
          wsId={wsId}
          currency={currency}
          filters={[
            <TypeFilterWrapper key="type-filter" />,
            <AmountFilterWrapper key="amount-filter" />,
          ]}
        />
      </TabsContent>

      <TabsContent value="tags">
        <TagManager wsId={wsId} />
      </TabsContent>
    </Tabs>
  );
}
