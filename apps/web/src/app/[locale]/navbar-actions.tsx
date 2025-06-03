import NotificationPopover from './notification-popover';
import { UserNavWrapper } from './user-nav-wrapper';
import { LOCALE_COOKIE_NAME } from '@/constants/common';
import { defaultLocale, supportedLocales } from '@/i18n/routing';
import { createClient } from '@ncthub/supabase/next/server';
import { GetStartedButton } from '@ncthub/ui/custom/get-started-button';
import { LanguageWrapper } from '@ncthub/ui/custom/language-wrapper';
import { ThemeToggle } from '@ncthub/ui/custom/theme-toggle';
import { getTranslations } from 'next-intl/server';

export default async function NavbarActions({
  hideMetadata = false,
}: {
  hideMetadata?: boolean;
}) {
  const t = await getTranslations();
  const supabase = await createClient();

  const {
    data: { user: sbUser },
  } = await supabase.auth.getUser();

  return (
    <div className="relative">
      <div className="flex items-center gap-1">
        {sbUser ? (
          <>
            <UserNavWrapper hideMetadata={hideMetadata} />
            <NotificationPopover />
          </>
        ) : (
          <>
            <GetStartedButton
              text={t('common.get-started')}
              href="/onboarding"
            />
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
