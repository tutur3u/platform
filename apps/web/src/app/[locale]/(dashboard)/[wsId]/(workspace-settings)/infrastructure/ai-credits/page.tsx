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
        <div
          key={i}
          className="h-24 animate-pulse rounded-2xl border border-border/60 bg-muted/40"
        />
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
    <div className="space-y-6 pb-8">
      <div className="relative overflow-hidden rounded-[28px] border border-border/70 bg-linear-to-br from-background via-background to-muted/30 p-6 shadow-sm">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(88,168,255,0.18),transparent_55%)]" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-linear-to-r from-transparent via-border to-transparent" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl space-y-2">
            <div className="inline-flex items-center rounded-full border border-border/70 bg-background/80 px-3 py-1 font-medium text-[11px] text-muted-foreground uppercase tracking-[0.22em]">
              {t('hero_eyebrow')}
            </div>
            <div>
              <h1 className="font-semibold text-3xl tracking-tight">
                {t('overview_title')}
              </h1>
              <p className="mt-2 max-w-xl text-muted-foreground">
                {t('overview_description')}
              </p>
            </div>
          </div>
          <div className="grid gap-2 text-muted-foreground text-sm sm:grid-cols-3">
            <div className="rounded-2xl border border-border/60 bg-background/80 px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.18em]">
                {t('hero_policy_title')}
              </p>
              <p className="mt-1 text-foreground">{t('hero_policy_body')}</p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/80 px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.18em]">
                {t('hero_runtime_title')}
              </p>
              <p className="mt-1 text-foreground">{t('hero_runtime_body')}</p>
            </div>
            <div className="rounded-2xl border border-border/60 bg-background/80 px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.18em]">
                {t('hero_audit_title')}
              </p>
              <p className="mt-1 text-foreground">{t('hero_audit_body')}</p>
            </div>
          </div>
        </div>
      </div>

      <Separator />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-auto w-full flex-wrap justify-start gap-2 rounded-2xl border border-border/60 bg-muted/30 p-2">
          <TabsTrigger
            value="overview"
            className="gap-1.5 rounded-xl px-3 py-2 data-[state=active]:shadow-sm"
          >
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">{t('tab_overview')}</span>
          </TabsTrigger>
          <TabsTrigger
            value="transactions"
            className="gap-1.5 rounded-xl px-3 py-2 data-[state=active]:shadow-sm"
          >
            <List className="h-4 w-4" />
            <span className="hidden sm:inline">{t('tab_transactions')}</span>
          </TabsTrigger>
          <TabsTrigger
            value="balances"
            className="gap-1.5 rounded-xl px-3 py-2 data-[state=active]:shadow-sm"
          >
            <Wallet className="h-4 w-4" />
            <span className="hidden sm:inline">{t('tab_balances')}</span>
          </TabsTrigger>
          <TabsTrigger
            value="allocations"
            className="gap-1.5 rounded-xl px-3 py-2 data-[state=active]:shadow-sm"
          >
            <CreditCard className="h-4 w-4" />
            <span className="hidden sm:inline">{t('tab_allocations')}</span>
          </TabsTrigger>
          <TabsTrigger
            value="models"
            className="gap-1.5 rounded-xl px-3 py-2 data-[state=active]:shadow-sm"
          >
            <Layers className="h-4 w-4" />
            <span className="hidden sm:inline">{t('tab_models')}</span>
          </TabsTrigger>
          <TabsTrigger
            value="features"
            className="gap-1.5 rounded-xl px-3 py-2 data-[state=active]:shadow-sm"
          >
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
