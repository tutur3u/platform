'use client';

import { cn } from '@tuturuuu/utils/format';
import { useTheme } from 'next-themes';
import {
  type FocusEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import type { MarketingLocale, Translate } from './i18n';
import { navGhost } from './nav-styles';
import { Monitor, Moon, Sun } from './static-icons';

type PreferenceProps = {
  t: Translate;
  locale: MarketingLocale;
  /** Without it the control offers the theme only. */
  onLocaleChange?: (locale: MarketingLocale) => void;
};

type Option<T extends string> = {
  value: T;
  label: string;
  icon?: ReactNode;
  lang?: string;
};

/**
 * A segmented radio group. Native radios give arrow-key movement, one tab
 * stop and "1 of 2, checked" announcements without extra ARIA.
 */
function Segmented<T extends string>({
  legend,
  value,
  options,
  onChange,
}: {
  legend: string;
  value: T | undefined;
  options: Option<T>[];
  onChange: (value: T) => void;
}) {
  const name = useId();
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 font-medium text-muted-foreground text-xs">
        {legend}
      </legend>
      <div className="grid auto-cols-fr grid-flow-col gap-1 rounded-(--radius-segment) bg-muted p-(--segment-padding)">
        {options.map((option) => (
          <label
            className={cn(
              'flex h-8 min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-(--radius-segment-inner) px-2 font-medium text-muted-foreground text-sm transition-colors hover:text-foreground',
              'has-checked:bg-background has-checked:text-foreground has-checked:shadow-sm',
              'has-focus-visible:ring-2 has-focus-visible:ring-ring'
            )}
            key={option.value}
          >
            <input
              checked={value === option.value}
              className="sr-only"
              name={name}
              onChange={() => onChange(option.value)}
              type="radio"
              value={option.value}
            />
            {option.icon}
            <span className="truncate" lang={option.lang}>
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Language and theme choices, shared by the navbar popover and the mobile sheet. */
export function PreferenceOptions({
  t,
  locale,
  onLocaleChange,
}: PreferenceProps) {
  const { theme, setTheme } = useTheme();
  const icon = 'size-3.5 shrink-0';
  return (
    <div className="grid gap-3">
      {onLocaleChange ? (
        <Segmented<MarketingLocale>
          legend={t('common.language')}
          onChange={onLocaleChange}
          options={[
            { value: 'en', label: 'English', lang: 'en' },
            { value: 'vi', label: 'Tiếng Việt', lang: 'vi' },
          ]}
          value={locale}
        />
      ) : null}
      <Segmented
        legend={t('common.theme')}
        onChange={setTheme}
        options={[
          {
            value: 'light',
            label: t('common.light'),
            icon: <Sun className={icon} />,
          },
          {
            value: 'dark',
            label: t('common.dark'),
            icon: <Moon className={icon} />,
          },
          {
            value: 'system',
            label: t('common.system'),
            icon: <Monitor className={icon} />,
          },
        ]}
        value={theme ?? 'system'}
      />
    </div>
  );
}

/** Theme icon that follows the resolved theme in CSS, so it never flashes. */
export function ThemeGlyph({ className }: { className?: string }) {
  return (
    <>
      <Sun className={cn('dark:hidden', className)} />
      <Moon className={cn('hidden dark:block', className)} />
    </>
  );
}

/**
 * One navbar control for language and theme: a disclosure button that shows
 * the current locale and theme, and a small panel of radio groups. Native
 * elements keep slot/variant libraries out of the public nav graph.
 */
export function MarketingPreferences({
  t,
  locale,
  onLocaleChange,
  className,
}: PreferenceProps & { className?: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const label = onLocaleChange
    ? `${t('common.language')}, ${t('common.theme')}`
    : t('common.theme');

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [open]);

  // Tabbing out closes the panel; a click on its padding (no new focus
  // target) does not.
  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget as Node | null;
    if (next && !rootRef.current?.contains(next)) setOpen(false);
  };

  return (
    <div
      // Phones anchor the panel to the navbar's right edge (the bar is the
      // positioned ancestor), so it never runs past the viewport.
      className={cn('sm:relative', className)}
      onBlur={handleBlur}
      ref={rootRef}
    >
      <button
        aria-controls={open ? panelId : undefined}
        aria-expanded={open}
        className={cn(navGhost, 'px-2.5')}
        onClick={() => setOpen((value) => !value)}
        ref={triggerRef}
        type="button"
      >
        <ThemeGlyph className="size-4" />
        {onLocaleChange ? (
          <span className="w-5 text-center uppercase">{locale}</span>
        ) : null}
        <span className="sr-only">{` – ${label}`}</span>
      </button>
      {open ? (
        <div
          aria-label={label}
          className="absolute top-full right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl bg-popover p-3 text-popover-foreground shadow-foreground/5 shadow-lg ring-1 ring-border"
          id={panelId}
          role="group"
        >
          <PreferenceOptions
            locale={locale}
            onLocaleChange={onLocaleChange}
            t={t}
          />
        </div>
      ) : null}
    </div>
  );
}
