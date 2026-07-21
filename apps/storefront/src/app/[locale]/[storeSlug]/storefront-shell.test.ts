import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const storefrontRoot = process.cwd().endsWith('/apps/storefront')
  ? process.cwd()
  : join(process.cwd(), 'apps/storefront');

describe('Storefront route shell', () => {
  it('keeps storefront chrome mounted across the full shopping journey', () => {
    const shellLayoutPath = join(
      storefrontRoot,
      'src/app/[locale]/[storeSlug]/(shop)/layout.tsx'
    );

    expect(existsSync(shellLayoutPath)).toBe(true);
    if (!existsSync(shellLayoutPath)) return;

    const shellLayout = readFileSync(shellLayoutPath, 'utf8');
    const sharedRoutePaths = [
      'page.tsx',
      'cart/page.tsx',
      'checkout/page.tsx',
      'checkout/cancel/page.tsx',
      'checkout/success/page.tsx',
      'orders/page.tsx',
      'orders/[publicToken]/page.tsx',
      'products/[listingId]/page.tsx',
    ];
    const surfaceRoutePaths = sharedRoutePaths.filter(
      (routePath) => routePath !== 'orders/page.tsx'
    );
    const historyClient = readFileSync(
      join(
        storefrontRoot,
        'src/components/storefront/purchase-history-client.tsx'
      ),
      'utf8'
    );
    const shellNavigation = readFileSync(
      join(
        storefrontRoot,
        'src/components/storefront/storefront-shell-navigation.tsx'
      ),
      'utf8'
    );

    expect(shellLayout).toContain('<StorefrontShell');
    for (const routePath of sharedRoutePaths) {
      expect(
        existsSync(
          join(storefrontRoot, 'src/app/[locale]/[storeSlug]/(shop)', routePath)
        )
      ).toBe(true);
    }
    for (const routePath of surfaceRoutePaths) {
      const route = readFileSync(
        join(storefrontRoot, 'src/app/[locale]/[storeSlug]/(shop)', routePath),
        'utf8'
      );
      expect(route).toContain('withinSharedShell');
    }
    expect(historyClient).not.toContain('<header');
    expect(historyClient).not.toContain('headerActions');
    expect(shellNavigation.match(/variant="outline"/g)).toHaveLength(2);
    expect(shellNavigation).toContain('aria-disabled={isHistory || undefined}');
    expect(shellNavigation).toContain('aria-disabled={isCart || undefined}');
    expect(shellNavigation).not.toContain("isHistory ? 'secondary'");
  });
});
