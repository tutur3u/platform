import { createClient } from '@tuturuuu/supabase/next/server';
import { LanguageWrapper } from '@tuturuuu/ui/custom/language-wrapper';
import { ThemeToggle } from '@tuturuuu/ui/custom/theme-toggle';
import { LOCALE_COOKIE_NAME } from '@/constants/common';
import { defaultLocale, supportedLocales } from '@/i18n/routing';
import { UserNavWrapper } from './user-nav-wrapper';

export default async function NavbarActions({
  hideMetadata = false,
}: {
  hideMetadata?: boolean;
}) {
  const supabase = await createClient();

  const {
    data: { user: sbUser },
  } = await supabase.auth.getUser();

  return (
    <div className="relative">
      <div className="flex items-center gap-1">
        {sbUser ? (
          <UserNavWrapper hideMetadata={hideMetadata} />
        ) : (
          <>
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
