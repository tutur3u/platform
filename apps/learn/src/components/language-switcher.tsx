'use client';

import { Languages } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';

const localeOptions = [
  { label: 'English', shortLabel: 'EN', value: 'en' },
  { label: 'Tiếng Việt', shortLabel: 'VI', value: 'vi' },
] as const;

export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const t = useTranslations();
  const locale = useLocale();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const href = query ? `${pathname}?${query}` : pathname;

  return (
    <fieldset
      className={cn(
        'inline-flex items-center gap-1 border-2 border-foreground bg-background p-1 text-foreground shadow-[3px_3px_0_var(--foreground)]',
        compact ? 'h-11' : 'w-full'
      )}
    >
      <legend className="sr-only">{t('settings.language')}</legend>
      <div
        aria-hidden="true"
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center border-2 border-foreground bg-dynamic-yellow',
          compact && 'hidden sm:flex'
        )}
      >
        <Languages className="h-4 w-4" />
      </div>
      {localeOptions.map((option) => {
        const active = locale === option.value;

        return (
          <Link
            aria-current={active ? 'true' : undefined}
            className={cn(
              'inline-flex h-9 min-w-10 flex-1 items-center justify-center px-3 font-black text-sm transition',
              active ? 'bg-dynamic-yellow' : 'hover:bg-dynamic-yellow/15'
            )}
            href={href}
            key={option.value}
            locale={option.value}
          >
            <span className="sm:hidden">{option.shortLabel}</span>
            <span className="hidden sm:inline">{option.label}</span>
          </Link>
        );
      })}
    </fieldset>
  );
}
