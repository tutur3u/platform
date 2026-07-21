import { NO_INDEX_ROBOTS } from '@tuturuuu/utils/common/metadata';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PurchaseHistoryClient } from '@/components/storefront/purchase-history-client';
import { getServerInventoryStorefront } from '@/components/storefront/storefront-server-loader';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; storeSlug: string }>;
}): Promise<Metadata> {
  const { locale, storeSlug } = await params;
  const [response, t] = await Promise.all([
    getServerInventoryStorefront(storeSlug),
    getTranslations({ locale, namespace: 'storefront.history' }),
  ]);

  return {
    robots: NO_INDEX_ROBOTS,
    title: `${t('title')} - ${response?.storefront.name ?? storeSlug}`,
  };
}

export default async function StorefrontOrdersPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;

  return (
    <main className="min-h-[calc(100dvh-4.3125rem)] bg-background text-foreground">
      <PurchaseHistoryClient storeSlug={storeSlug} />
    </main>
  );
}
