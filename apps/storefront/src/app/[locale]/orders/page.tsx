import { NO_INDEX_ROBOTS } from '@tuturuuu/utils/common/metadata';
import type { Metadata } from 'next';
import { PurchaseHistoryClient } from '@/components/storefront/purchase-history-client';
import { siteConfig } from '@/constants/configs';
import { Link } from '@/i18n/navigation';
import { StorefrontHeaderActions } from '../storefront-header-actions';

export const metadata: Metadata = {
  robots: NO_INDEX_ROBOTS,
};

export default function StorefrontAllOrdersPage() {
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-30 border-border border-b bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/85">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-5 py-3 sm:px-6">
          <Link
            className="font-semibold text-base tracking-tight transition hover:text-primary"
            href="/"
            prefetch
          >
            {siteConfig.name}
          </Link>
          <StorefrontHeaderActions />
        </div>
      </header>
      <PurchaseHistoryClient />
    </main>
  );
}
