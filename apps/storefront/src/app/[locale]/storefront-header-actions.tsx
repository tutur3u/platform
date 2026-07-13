import { ReceiptText, Store } from '@tuturuuu/icons';
import type { InventoryStorefront } from '@tuturuuu/internal-api/inventory';
import { getSatelliteAppSessionUser } from '@tuturuuu/satellite/auth';
import { Button } from '@tuturuuu/ui/button';
import { ThemeToggle } from '@tuturuuu/ui/custom/theme-toggle';
import { connection } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { getOptionalInventoryPublicStorefront } from '@/components/storefront/storefront-loader';
import { INVENTORY_APP_URL } from '@/constants/common';
import { Link } from '@/i18n/navigation';
import { resolveInventoryStorefrontManageHref } from '@/lib/storefront-manage-access';
import { UserNav } from './user-nav';

/**
 * Compact storefront header actions: the logged-in Tuturuuu user dropdown
 * (avatar + theme switcher + language switcher + sign out) when authenticated,
 * or a theme toggle + sign-in link for anonymous shoppers.
 */
export async function StorefrontHeaderActions({
  storeSlug,
  storefront,
}: {
  storeSlug?: string;
  storefront?: Pick<InventoryStorefront, 'id' | 'wsId'> | null;
} = {}) {
  await connection();

  // Resilient: a session/auth fetch hiccup (e.g. an internal API blip) must
  // never crash the storefront page — fall back to the signed-out controls.
  let user: Awaited<ReturnType<typeof getSatelliteAppSessionUser>> | null =
    null;
  try {
    user = await getSatelliteAppSessionUser('storefront');
  } catch {
    user = null;
  }

  const t = await getTranslations('storefront');

  if (user) {
    let resolvedStorefront = storefront;
    if (resolvedStorefront === undefined && storeSlug) {
      resolvedStorefront = (
        await getOptionalInventoryPublicStorefront(storeSlug, {
          baseUrl: INVENTORY_APP_URL,
        }).catch(() => null)
      )?.storefront;
    }

    const manageHref = resolvedStorefront
      ? await resolveInventoryStorefrontManageHref({
          storefront: resolvedStorefront,
          user,
        })
      : null;

    return (
      <div className="flex items-center gap-2">
        {manageHref ? (
          <Button asChild size="sm" variant="secondary">
            <a href={manageHref}>
              <Store className="size-4" />
              {t('manageStore')}
            </a>
          </Button>
        ) : null}
        {storeSlug ? (
          <Button asChild size="sm" variant="outline">
            <Link href={`/${storeSlug}/orders`}>
              <ReceiptText className="size-4" />
              {t('history.shortTitle')}
            </Link>
          </Button>
        ) : null}
        <UserNav hideMetadata />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <ThemeToggle />
      <Button asChild size="sm" variant="outline">
        <Link href="/login">{t('signIn')}</Link>
      </Button>
    </div>
  );
}
