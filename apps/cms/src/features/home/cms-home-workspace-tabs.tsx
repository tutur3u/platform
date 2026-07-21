import { Store } from '@tuturuuu/icons';
import type { ExternalProjectAttentionItem } from '@tuturuuu/types';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@tuturuuu/ui/tabs';
import { useTranslations } from 'next-intl';
import type {
  CmsCommerceInsights,
  CmsCommerceOverview,
} from '@/lib/commerce-client';
import { CmsHomeCommerce } from './cms-home-commerce';
import { ContinueEditingPanel } from './cms-home-panels';
import { CmsHomeQuickActions } from './cms-home-quick-actions';
import { CmsHomeReview } from './cms-home-review';
import { CmsHomeStoreHealth } from './cms-home-store-health';

interface CmsHomeQueryState<T> {
  data: T | undefined;
  isError: boolean;
  isPending: boolean;
  retry: () => void;
}

export function CmsHomeWorkspaceTabs({
  attentionItems,
  commerce,
  continueItem,
  insights,
  stats,
  workspaceSlug,
}: {
  attentionItems: ExternalProjectAttentionItem[];
  commerce: CmsHomeQueryState<CmsCommerceOverview>;
  continueItem: ExternalProjectAttentionItem | null;
  insights: CmsHomeQueryState<CmsCommerceInsights>;
  stats: ReadonlyArray<readonly [string, number]>;
  workspaceSlug: string;
}) {
  const t = useTranslations('external-projects');
  const libraryHref = `/${workspaceSlug}/content`;
  const pagesHref = `/${workspaceSlug}/pages`;
  const previewHref = `/${workspaceSlug}/preview`;
  const urlPathLabel = t('epm.slug_label');

  return (
    <Tabs defaultValue="start" className="space-y-4">
      <TabsList className="grid h-auto w-full grid-cols-3 sm:w-fit sm:min-w-md">
        <TabsTrigger value="start">{t('epm.home_tab_start')}</TabsTrigger>
        <TabsTrigger value="review" className="gap-2">
          {t('epm.home_tab_review')}
          {attentionItems.length > 0 ? (
            <span className="rounded-full bg-foreground/10 px-1.5 text-[10px] tabular-nums">
              {attentionItems.length}
            </span>
          ) : null}
        </TabsTrigger>
        <TabsTrigger value="commerce">{t('epm.home_tab_commerce')}</TabsTrigger>
      </TabsList>

      <TabsContent value="start" className="mt-0 space-y-4">
        <CmsHomeQuickActions
          actions={[
            {
              description: t('epm.home_landing_description'),
              href: pagesHref,
              kind: 'pages',
              title: t('epm.home_landing_title'),
            },
            {
              description: t('epm.home_content_description'),
              href: libraryHref,
              kind: 'content',
              title: t('epm.home_content_title'),
            },
            {
              description: t('epm.home_preview_description'),
              href: previewHref,
              kind: 'preview',
              title: t('epm.home_preview_title'),
            },
            {
              description: t('epm.home_members_description'),
              href: `/${workspaceSlug}/members`,
              kind: 'members',
              title: t('epm.home_members_title'),
            },
          ]}
        />
        <ContinueEditingPanel
          description={t('epm.continue_editing_description')}
          emptyLabel={t('epm.home_status_ready_description')}
          href={libraryHref}
          item={continueItem}
          title={t('epm.continue_editing_title')}
          urlPathLabel={urlPathLabel}
        />
      </TabsContent>

      <TabsContent value="review" className="mt-0">
        <CmsHomeReview
          actionHref={libraryHref}
          items={attentionItems}
          stats={stats}
          urlPathLabel={urlPathLabel}
        />
      </TabsContent>

      <TabsContent value="commerce" className="mt-0 space-y-4">
        <section className="rounded-lg border border-border/70 bg-card/75 p-5">
          <div className="mb-4 flex items-center gap-2">
            <Store className="size-4 text-muted-foreground" />
            <div>
              <h2 className="font-semibold">
                {t('epm.commerce_snapshot_title')}
              </h2>
              <p className="mt-1 text-muted-foreground text-sm">
                {t('epm.commerce_snapshot_description')}
              </p>
            </div>
          </div>
          <CmsHomeCommerce
            isError={commerce.isError}
            isPending={commerce.isPending}
            onRetry={commerce.retry}
            overview={commerce.data}
          />
        </section>
        <CmsHomeStoreHealth
          insights={insights.data}
          isError={insights.isError}
          isPending={insights.isPending}
          onRetry={insights.retry}
          workspaceSlug={workspaceSlug}
        />
      </TabsContent>
    </Tabs>
  );
}
