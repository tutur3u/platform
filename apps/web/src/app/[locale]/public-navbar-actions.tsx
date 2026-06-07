import { GetStartedButton } from '@tuturuuu/ui/custom/get-started-button';
import { LanguageWrapper } from '@tuturuuu/ui/custom/language-wrapper';
import { ThemeToggle } from '@tuturuuu/ui/custom/theme-toggle';
import { getTranslations } from 'next-intl/server';
import { LOCALE_COOKIE_NAME } from '@/constants/common';
import { defaultLocale, supportedLocales } from '@/i18n/routing';

export default async function PublicNavbarActions() {
  const t = await getTranslations();

  return (
    <div className="relative flex w-full">
      <div className="flex w-full flex-col gap-2">
        <div className="flex w-full items-center gap-1">
          <GetStartedButton text={t('common.get-started')} href="/onboarding" />
          <LanguageWrapper
            cookieName={LOCALE_COOKIE_NAME}
            defaultLocale={defaultLocale}
            supportedLocales={supportedLocales}
          />
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}
