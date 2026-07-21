import type { InventoryStorefront } from '@tuturuuu/internal-api/inventory';
import {
  getAccentStyle,
  sanitizeStorefrontAccentColor,
} from '@tuturuuu/ui/storefront';
import type { ReactNode } from 'react';
import { Link } from '@/i18n/navigation';
import { StorefrontShellNavigation } from './storefront-shell-navigation';

export function StorefrontShell({
  accountActions,
  children,
  storefront,
}: {
  accountActions: ReactNode;
  children: ReactNode;
  storefront: InventoryStorefront;
}) {
  const accentColor = sanitizeStorefrontAccentColor(storefront.accentColor);

  return (
    <div
      className="min-h-dvh bg-background font-sans text-foreground"
      style={getAccentStyle(accentColor)}
    >
      <header
        className="sticky top-0 z-30 border-border border-b bg-background/95 backdrop-blur-md supports-[backdrop-filter]:bg-background/85"
        data-storefront-shell
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-5 py-3 sm:px-6">
          <h1 className="min-w-0 truncate font-semibold text-base tracking-tight">
            <Link
              className="flex min-w-0 items-center gap-3 rounded-sm transition hover:text-[var(--storefront-accent-text,var(--primary))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              href={`/${storefront.slug}`}
              prefetch
              title={storefront.name}
            >
              <span
                aria-hidden
                className="grid size-8 shrink-0 place-items-center rounded-lg border border-border bg-muted/35 font-mono text-xs uppercase"
              >
                {storefront.name.slice(0, 1)}
              </span>
              <span className="truncate">{storefront.name}</span>
            </Link>
          </h1>

          <StorefrontShellNavigation
            accountActions={accountActions}
            storeSlug={storefront.slug}
          />
        </div>
      </header>

      {children}
    </div>
  );
}
