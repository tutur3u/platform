'use client';

import { Moon, Sun } from '@tuturuuu/icons/lucide-static';
import { persistLocalePreference } from '@tuturuuu/ui/custom/locale-preference';
import { cn } from '@tuturuuu/utils/format';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { useTransition } from 'react';
import { LOCALE_COOKIE_NAME } from '@/constants/common';
import {
  type Locale,
  supportedLocales,
  usePathname,
  useRouter,
} from '@/i18n/routing';

/** An invisible hit area grows a 32px control to the 44px touch target. */
const HIT_AREA = "relative after:absolute after:-inset-1.5 after:content-['']";

/**
 * The sign-in page's corner controls: an EN/VI segment that uses the shared
 * locale cookie and the localized route (keeping the query, so a return URL
 * survives), and a light/dark switch through the app theme provider.
 */
export function AuthTopControls() {
  const t = useTranslations('login');
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { resolvedTheme, setTheme } = useTheme();
  const [switching, startSwitch] = useTransition();

  const chooseLocale = (next: Locale) => {
    if (next === locale) return;
    persistLocalePreference(next, LOCALE_COOKIE_NAME);
    const query = searchParams.toString();
    startSwitch(() => {
      router.replace(query ? `${pathname}?${query}` : pathname, {
        locale: next,
        scroll: false,
      });
    });
  };

  return (
    <div className="flex items-center justify-end gap-2">
      <div
        aria-label={t('language')}
        className="inline-flex items-center gap-0.5 rounded-full bg-secondary p-0.5"
        role="group"
      >
        {supportedLocales.map((option) => (
          <button
            aria-pressed={option === locale}
            className={cn(
              HIT_AREA,
              'inline-flex h-8 items-center rounded-full px-3 font-bold text-xs uppercase transition-colors focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 motion-reduce:transition-none',
              option === locale
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            )}
            disabled={switching}
            key={option}
            lang={option}
            onClick={() => chooseLocale(option)}
            type="button"
          >
            {option}
          </button>
        ))}
      </div>
      <button
        aria-label={t('switch_theme')}
        className={cn(
          HIT_AREA,
          'inline-flex size-8 items-center justify-center rounded-full text-foreground transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2'
        )}
        onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
        type="button"
      >
        <Moon aria-hidden className="size-4 dark:hidden" />
        <Sun aria-hidden className="hidden size-4 dark:block" />
      </button>
    </div>
  );
}
