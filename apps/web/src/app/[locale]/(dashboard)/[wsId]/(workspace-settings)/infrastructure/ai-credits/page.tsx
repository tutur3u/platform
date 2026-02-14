'use client';

import {
  BarChart3,
  Coins,
  CreditCard,
  Layers,
  List,
  Wallet,
} from '@tuturuuu/icons';
import { Separator } from '@tuturuuu/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useCallback } from 'react';
import AllocationsTab from './_components/allocations-tab';
import BalancesTab from './_components/balances-tab';
import FeaturesTab from './_components/features-tab';
import ModelsTab from './_components/models-tab';
import OverviewTab from './_components/overview-tab';
import TransactionsTab from './_components/transactions-tab';

const TAB_IDS = [
  'overview',
  'transactions',
  'balances',
  'allocations',
  'models',
  'features',
] as const;

type TabId = (typeof TAB_IDS)[number];

function TabFallback() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
      ))}
    </div>
  );
}

function AiCreditsPageContent() {
  const t = useTranslations('ai-credits-admin');
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const activeTab = (searchParams.get('tab') as TabId) || 'overview';

  const setActiveTab = useCallback(
    (tab: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (tab === 'overview') {
        params.delete('tab');
      } else {
        params.set('tab', tab);
      }
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [searchParams, router, pathname]
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-bold text-2xl">{t('overview_title')}</h1>
        <p className="text-muted-foreground">{t('overview_description')}</p>
      </div>

      <Separator />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex w-full flex-wrap justify-start">
          <TabsTrigger value="overview" className="gap-1.5">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">{t('tab_overview')}</span>
          </TabsTrigger>
          <TabsTrigger value="transactions" className="gap-1.5">
            <List className="h-4 w-4" />
            <span className="hidden sm:inline">{t('tab_transactions')}</span>
          </TabsTrigger>
          <TabsTrigger value="balances" className="gap-1.5">
            <Wallet className="h-4 w-4" />
            <span className="hidden sm:inline">{t('tab_balances')}</span>
          </TabsTrigger>
          <TabsTrigger value="allocations" className="gap-1.5">
            <CreditCard className="h-4 w-4" />
            <span className="hidden sm:inline">{t('tab_allocations')}</span>
          </TabsTrigger>
          <TabsTrigger value="models" className="gap-1.5">
            <Layers className="h-4 w-4" />
            <span className="hidden sm:inline">{t('tab_models')}</span>
          </TabsTrigger>
          <TabsTrigger value="features" className="gap-1.5">
            <Coins className="h-4 w-4" />
            <span className="hidden sm:inline">{t('tab_features')}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          <Suspense fallback={<TabFallback />}>
            <OverviewTab />
          </Suspense>
        </TabsContent>
        <TabsContent value="transactions" className="mt-6">
          <Suspense fallback={<TabFallback />}>
            <TransactionsTab />
          </Suspense>
        </TabsContent>
        <TabsContent value="balances" className="mt-6">
          <Suspense fallback={<TabFallback />}>
            <BalancesTab />
          </Suspense>
        </TabsContent>
        <TabsContent value="allocations" className="mt-6">
          <Suspense fallback={<TabFallback />}>
            <AllocationsTab />
          </Suspense>
        </TabsContent>
        <TabsContent value="models" className="mt-6">
          <Suspense fallback={<TabFallback />}>
            <ModelsTab />
          </Suspense>
        </TabsContent>
        <TabsContent value="features" className="mt-6">
          <Suspense fallback={<TabFallback />}>
            <FeaturesTab />
          </Suspense>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function AiCreditsOverviewPage() {
  return (
    <Suspense fallback={<TabFallback />}>
      <AiCreditsPageContent />
    </Suspense>
  );
}
