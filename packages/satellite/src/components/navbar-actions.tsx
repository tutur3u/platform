import { GetStartedButton } from '@tuturuuu/ui/custom/get-started-button';
import { LanguageWrapper } from '@tuturuuu/ui/custom/language-wrapper';
import { ThemeToggle } from '@tuturuuu/ui/custom/theme-toggle';
import { getTranslations } from 'next-intl/server';
import { getSatelliteAppSession } from '../auth';
import { LOCALE_COOKIE_NAME } from '../constants/common';
import { defaultLocale, supportedLocales } from '../i18n/routing';
import NotificationPopover from './notification-popover';
import { UserNavWrapper } from './user-nav-wrapper';

export default async function NavbarActions({
  hideMetadata = false,
  userId,
}: {
  hideMetadata?: boolean;
  userId?: string;
}) {
  const t = await getTranslations();
  const appSession = userId ? null : await getSatelliteAppSession();
  const isAuthenticated = Boolean(userId || appSession);

  return (
    <div className="relative flex w-full">
      <div className="flex w-full flex-col gap-2">
        {/* Main actions row */}
        <div className="flex w-full items-center gap-1">
          {isAuthenticated ? (
            <>
              <div className="flex-1">
                <UserNavWrapper hideMetadata={hideMetadata} />
              </div>
              <NotificationPopover userId={userId ?? appSession?.sub} />
            </>
          ) : (
            <>
              <GetStartedButton text={t('common.get-started')} href="/login" />
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
    </div>
  );
}
