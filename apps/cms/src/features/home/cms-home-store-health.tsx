import { AlertTriangle, CheckCircle2, ChevronRight } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { CmsCommerceInsights } from '@/lib/commerce-client';

interface Suggestion {
  href: string;
  label: string;
}

/**
 * Store health — a smart utility that turns cross-app commerce signals
 * (inventory stock + storefront listings/status) into actionable nudges on the
 * dashboard. Renders nothing for workspaces without products or a storefront.
 */
export function CmsHomeStoreHealth({
  insights,
  isError,
  isPending,
  onRetry,
  workspaceSlug,
}: {
  insights: CmsCommerceInsights | null | undefined;
  isError: boolean;
  isPending: boolean;
  onRetry: () => void;
  workspaceSlug: string;
}) {
  const t = useTranslations('external-projects');

  if (isPending) {
    return <Skeleton className="h-32 rounded-lg" />;
  }

  if (isError) {
    return (
      <div className="flex items-center justify-between gap-4 rounded-lg border border-dashed p-4">
        <p className="text-muted-foreground text-sm">
          {t('epm.store_health_error_description')}
        </p>
        <Button onClick={onRetry} size="sm" variant="outline">
          {t('epm.retry_action')}
        </Button>
      </div>
    );
  }

  if (!insights || (!insights.hasStorefront && insights.totalProducts === 0)) {
    return (
      <div className="rounded-lg border border-dashed p-4 text-muted-foreground text-sm leading-6">
        {t('epm.store_health_empty_description')}
      </div>
    );
  }

  const productsHref = `/${workspaceSlug}/products`;
  const storefrontHref = `/${workspaceSlug}/storefront`;
  const suggestions: Suggestion[] = [];
  if (insights.outOfStock > 0) {
    suggestions.push({
      href: productsHref,
      label: t('epm.store_health_out_of_stock', { count: insights.outOfStock }),
    });
  }
  if (insights.unlisted > 0) {
    suggestions.push({
      href: storefrontHref,
      label: t('epm.store_health_unlisted', { count: insights.unlisted }),
    });
  }
  if (insights.hasStorefront && !insights.storefrontPublished) {
    suggestions.push({
      href: storefrontHref,
      label: t('epm.store_health_storefront_draft'),
    });
  }

  return (
    <section className="rounded-lg border border-border/70 bg-card/75">
      <div className="flex items-center gap-2 border-border/70 border-b px-4 py-3">
        <AlertTriangle className="h-4 w-4 text-muted-foreground" />
        <h2 className="font-medium text-sm">{t('epm.store_health_title')}</h2>
      </div>
      {suggestions.length === 0 ? (
        <div className="flex items-center gap-2 px-4 py-4 text-muted-foreground text-sm">
          <CheckCircle2 className="h-4 w-4 text-dynamic-green" />
          {t('epm.store_health_all_good')}
        </div>
      ) : (
        <ul className="divide-y divide-border/60">
          {suggestions.map((suggestion) => (
            <li key={suggestion.label}>
              <Link
                href={suggestion.href}
                className="flex items-center justify-between gap-3 px-4 py-3 text-sm transition-colors hover:bg-background/70"
              >
                <span>{suggestion.label}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
