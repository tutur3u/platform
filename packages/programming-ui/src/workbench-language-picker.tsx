'use client';
import { Check, ChevronDown, CodeXml, Loader2 } from '@tuturuuu/icons';
import type { PlaygroundLanguage } from '@tuturuuu/types/primitives/playgrounds';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@tuturuuu/ui/dropdown-menu';
import { useTranslations } from 'next-intl';
import type { KeyboardEvent } from 'react';
import { classNames as cn } from './class-names';
import { LANGUAGE_LABELS } from './workbench-language';

export { LANGUAGE_LABELS };

const PRIMARY = ['python', 'javascript', 'typescript'] as const;

// The active runtime is a filled pill with a check, so it reads at a glance.
const segment = (checked: boolean) =>
  cn(
    'inline-flex h-7 items-center gap-1 rounded-full px-3 font-semibold text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-60 motion-reduce:transition-none',
    checked
      ? 'bg-primary text-primary-foreground shadow-xs'
      : 'text-muted-foreground hover:text-foreground'
  );

function Selected({ checked }: { checked: boolean }) {
  return checked ? <Check aria-hidden="true" className="size-3.5" /> : null;
}

/**
 * Python, JavaScript and TypeScript as one segmented control with the other
 * runtimes behind "More". Without `onChange` it is a read-only chip, because
 * only hosts change the room's runtime.
 */
export function WorkbenchLanguagePicker({
  language,
  languages,
  onChange,
  pending = false,
}: {
  language: PlaygroundLanguage;
  languages: readonly PlaygroundLanguage[];
  onChange?: (language: PlaygroundLanguage) => void;
  pending?: boolean;
}) {
  const t = useTranslations('programmingPlayground');
  if (!onChange)
    return (
      <span
        data-language={language}
        title={t('languageHostOnly')}
        className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-primary/25 bg-primary/10 px-2.5 font-semibold text-foreground text-xs"
      >
        <CodeXml aria-hidden="true" className="size-3.5 text-primary" />
        <span className="sr-only">{t('language')}: </span>
        {LANGUAGE_LABELS[language]}
      </span>
    );
  const primary = PRIMARY.filter((value) => languages.includes(value));
  const others = languages.filter(
    (value) => !(PRIMARY as readonly string[]).includes(value)
  );
  const choose = (value: PlaygroundLanguage) => {
    if (value !== language && !pending) onChange(value);
  };
  const onKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number
  ) => {
    const step =
      event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (!step || !primary.length) return;
    event.preventDefault();
    const next = primary[(index + step + primary.length) % primary.length]!;
    choose(next);
    event.currentTarget.parentElement
      ?.querySelector<HTMLButtonElement>(`[data-language="${next}"]`)
      ?.focus();
  };
  const otherSelected = others.includes(language);
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <div
        role="radiogroup"
        aria-label={t('language')}
        aria-busy={pending}
        className="inline-flex items-center gap-0.5 rounded-full border bg-muted/50 p-0.5"
      >
        {primary.map((value, index) => (
          <button
            key={value}
            type="button"
            role="radio"
            data-language={value}
            aria-checked={language === value}
            tabIndex={
              language === value ||
              (!primary.includes(language as never) && index === 0)
                ? 0
                : -1
            }
            disabled={pending}
            onClick={() => choose(value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={segment(language === value)}
          >
            <Selected checked={language === value} />
            {LANGUAGE_LABELS[value]}
          </button>
        ))}
        {others.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={
                  otherSelected
                    ? `${LANGUAGE_LABELS[language]}, ${t('moreLanguages')}`
                    : t('moreLanguages')
                }
                aria-checked={otherSelected}
                role="radio"
                disabled={pending}
                className={segment(otherSelected)}
              >
                <Selected checked={otherSelected} />
                {otherSelected
                  ? LANGUAGE_LABELS[language]
                  : t('moreLanguagesShort')}
                <ChevronDown aria-hidden="true" className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-40">
              {others.map((value) => (
                <DropdownMenuItem key={value} onSelect={() => choose(value)}>
                  <Check
                    aria-hidden="true"
                    className={cn(
                      'size-4',
                      value === language ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  {LANGUAGE_LABELS[value]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {pending && (
        <output aria-label={t('switchingLanguage')}>
          <Loader2
            aria-hidden="true"
            className="size-3.5 animate-spin text-muted-foreground motion-reduce:animate-none"
          />
        </output>
      )}
    </div>
  );
}
