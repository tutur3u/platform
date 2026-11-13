'use client';
import { MarketingActions } from '@tuturuuu/marketing-shell';
import { persistLocalePreference } from '@tuturuuu/ui/custom/locale-preference';
import { usePathname, useRouter } from '@/i18n/routing';
import { useLocale, useTranslations } from 'next-intl';

export function MarketingControls() {
  const locale = useLocale() === 'vi' ? 'vi' : 'en';
  const t = useTranslations();
  const pathname = usePathname();
  const router = useRouter();
  return (
    <MarketingActions
      t={(key) => t(key as never)}
      locale={locale}
      pathname={pathname}
      siteUrl=""
      signInHref="/login"
      onLocaleChange={(next) => {
        persistLocalePreference(next);
        router.replace(
          `${pathname}${window.location.search}${window.location.hash}`,
          {
            locale: next,
            scroll: false,
          }
        );
      }}
    />
  );
}
