import NotificationPopover from '@tuturuuu/satellite/notification-popover';
import { GetStartedButton } from '@tuturuuu/ui/custom/get-started-button';
import { LanguageWrapper } from '@tuturuuu/ui/custom/language-wrapper';
import { ThemeToggle } from '@tuturuuu/ui/custom/theme-toggle';
import { getTranslations } from 'next-intl/server';
import { LOCALE_COOKIE_NAME } from '@/constants/common';
import { defaultLocale, supportedLocales } from '@/i18n/routing';
import { getNovaAppSessionUserFromHeaders } from '@/lib/app-session';
import { UserNavWrapper } from './user-nav-wrapper';

export default async function NavbarActions({
  hideMetadata = false,
  userId,
}: {
  hideMetadata?: boolean;
  userId?: string;
}) {
  const t = await getTranslations();
  const sbUser = userId ? null : await getNovaAppSessionUserFromHeaders();
  const resolvedUserId = userId ?? sbUser?.id;

  return (
    <div className="relative">
      <div className="flex items-center gap-1">
        {resolvedUserId ? (
          <>
            <NotificationPopover userId={resolvedUserId} />
            <UserNavWrapper hideMetadata={hideMetadata} />
          </>
        ) : (
          <>
            <GetStartedButton text={t('home.get-started')} href="/home" />
            <LanguageWrapper
              cookieName={LOCALE_COOKIE_NAME}
              defaultLocale={defaultLocale}
              supportedLocales={supportedLocales}
            />
            <ThemeToggle />
          </>
        )}
      </div>
    </div>
  );
}
