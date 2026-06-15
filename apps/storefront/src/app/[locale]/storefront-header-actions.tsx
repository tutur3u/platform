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
export async function StorefrontHeaderActions() {
  const session = await getSatelliteAppSession('storefront');

  if (session) {
    return <UserNav hideMetadata />;
  }

  const t = await getTranslations('storefront');

  return (
    <div className="flex items-center gap-1">
      <ThemeToggle />
      <Button asChild size="sm" variant="outline">
        <Link href="/login">{t('signIn')}</Link>
      </Button>
    </div>
  );
}
