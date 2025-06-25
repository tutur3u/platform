import { createClient } from '@tuturuuu/supabase/next/server';
import { GetStartedButton } from '@tuturuuu/ui/custom/get-started-button';
import { ThemeToggle } from '@tuturuuu/ui/custom/theme-toggle';
import { getTranslations } from 'next-intl/server';
import { UserNavWrapper } from './user-nav-wrapper';

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
          </>
        ) : (
          <>
            <GetStartedButton text={t('home.get-started')} href="/home" />
            {/* <LanguageWrapper
              cookieName={LOCALE_COOKIE_NAME}
              defaultLocale={defaultLocale}
              supportedLocales={supportedLocales}
            /> */}
            <ThemeToggle />
          </>
        )}
      </div>
    </div>
  );
}
