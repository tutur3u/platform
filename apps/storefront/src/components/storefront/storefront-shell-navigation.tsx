'use client';

import { ReceiptText, ShoppingCart } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Link, usePathname } from '@/i18n/navigation';
import { useCart } from './storefront-cart';

export function StorefrontShellNavigation({
  accountActions,
  storeSlug,
}: {
  accountActions: ReactNode;
  storeSlug: string;
}) {
  const t = useTranslations('storefront');
  const pathname = usePathname();
  const { cart } = useCart(storeSlug);
  const cartQuantity = cart.reduce((total, line) => total + line.quantity, 0);
  const isHistory = pathname.startsWith(`/${storeSlug}/orders`);
  const isCart = pathname.startsWith(`/${storeSlug}/cart`);

  return (
    <nav
      aria-label={t('browse')}
      className="flex min-w-0 items-center gap-1.5 sm:gap-2"
    >
      <Button
        asChild
        className="shrink-0 aria-disabled:pointer-events-none aria-disabled:opacity-50"
        size="sm"
        variant="outline"
      >
        <Link
          aria-current={isHistory ? 'page' : undefined}
          aria-disabled={isHistory || undefined}
          href={`/${storeSlug}/orders`}
          onClick={isHistory ? (event) => event.preventDefault() : undefined}
          prefetch
          tabIndex={isHistory ? -1 : undefined}
        >
          <ReceiptText aria-hidden className="size-4" />
          <span className="hidden sm:inline">{t('history.shortTitle')}</span>
        </Link>
      </Button>

      <Button
        asChild
        className="shrink-0 aria-disabled:pointer-events-none aria-disabled:opacity-50"
        size="sm"
        variant="outline"
      >
        <Link
          aria-current={isCart ? 'page' : undefined}
          aria-disabled={isCart || undefined}
          aria-label={`${t('cart')}: ${cartQuantity}`}
          href={`/${storeSlug}/cart`}
          onClick={isCart ? (event) => event.preventDefault() : undefined}
          prefetch
          tabIndex={isCart ? -1 : undefined}
        >
          <ShoppingCart aria-hidden className="size-4" />
          <span className="sr-only">{t('cart')}</span>
          <span aria-hidden className="min-w-3 text-center tabular-nums">
            {cartQuantity}
          </span>
        </Link>
      </Button>

      {accountActions}
    </nav>
  );
}
