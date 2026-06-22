import { ReceiptText } from '@tuturuuu/icons';
import { getSatelliteAppSession } from '@tuturuuu/satellite/auth';
import { Button } from '@tuturuuu/ui/button';
import { ThemeToggle } from '@tuturuuu/ui/custom/theme-toggle';
import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { UserNav } from './user-nav';

/**
 * Compact storefront header actions: the logged-in Tuturuuu user dropdown
 * (avatar + theme switcher + language switcher + sign out) when authenticated,
 * or a theme toggle + sign-in link for anonymous shoppers.
 */
export async function StorefrontHeaderActions({
  storeSlug,
}: {
  storeSlug?: string;
} = {}) {
  // Resilient: a session/auth fetch hiccup (e.g. an internal API blip) must
  // never crash the storefront page — fall back to the signed-out controls.
  let session: Awaited<ReturnType<typeof getSatelliteAppSession>> | null = null;
  try {
    session = await getSatelliteAppSession('storefront');
  } catch {
    session = null;
  }

  const t = await getTranslations('storefront');

  if (session) {
    return (
      <div className="flex items-center gap-2">
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
