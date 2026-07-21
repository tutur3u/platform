import type { ReactNode } from 'react';
import { StorefrontCartProvider } from '@/components/storefront/storefront-cart';

export default async function StorefrontLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;

  return (
    <StorefrontCartProvider storeSlug={storeSlug}>
      {children}
    </StorefrontCartProvider>
  );
}
