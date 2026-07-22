'use client';

import { Palette, Sparkles } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { ColorField, FieldLabel } from './operator-form-fields';

const DEFAULT_CUSTOM_ACCENT = '#111827';

export function StorefrontAccentField({
  className,
  onChange,
  value,
}: {
  className?: string;
  onChange: (value: string) => void;
  value: string;
}) {
  const t = useTranslations('inventory.operator.forms');
  const radioName = useId();
  const nativeSelected = value.trim().length === 0;

  return (
    <fieldset className={cn('grid min-w-0 gap-2', className)}>
      <legend className="mb-1 text-sm">
        <FieldLabel
          hint={t('hints.accentColor')}
          icon={Palette}
          label={t('accentColor')}
        />
      </legend>
      <div className="grid min-w-0 gap-2 sm:grid-cols-2">
        <label
          className={cn(
            'group flex min-w-0 cursor-pointer items-start gap-3 rounded-lg border p-3 text-left transition-colors',
            nativeSelected
              ? 'border-primary bg-primary/5'
              : 'border-border bg-background hover:bg-muted/50'
          )}
        >
          <input
            checked={nativeSelected}
            className="sr-only"
            name={radioName}
            onChange={() => onChange('')}
            type="radio"
          />
          <span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
            <Sparkles className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium text-sm">
              {t('accentNative')}
            </span>
            <span className="mt-0.5 block text-muted-foreground text-xs leading-5">
              {t('accentNativeDescription')}
            </span>
            <span className="mt-2 flex items-center gap-1.5" aria-hidden>
              <span className="size-3 rounded-full bg-primary" />
              <span className="size-3 rounded-full bg-secondary" />
              <span className="size-3 rounded-full bg-accent" />
            </span>
          </span>
        </label>
        <label
          className={cn(
            'group flex min-w-0 cursor-pointer items-start gap-3 rounded-lg border p-3 text-left transition-colors',
            nativeSelected
              ? 'border-border bg-background hover:bg-muted/50'
              : 'border-primary bg-primary/5'
          )}
        >
          <input
            checked={!nativeSelected}
            className="sr-only"
            name={radioName}
            onChange={() => onChange(value || DEFAULT_CUSTOM_ACCENT)}
            type="radio"
          />
          <span className="grid size-9 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground">
            <Palette className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium text-sm">
              {t('accentCustom')}
            </span>
            <span className="mt-0.5 block text-muted-foreground text-xs leading-5">
              {t('accentCustomDescription')}
            </span>
          </span>
        </label>
      </div>
      {nativeSelected ? (
        <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-muted-foreground text-xs leading-5">
          {t('accentNativeHint')}
        </div>
      ) : (
        <ColorField
          label={t('accentCustomColor')}
          onChange={onChange}
          placeholder={t('placeholders.accentColor')}
          value={value}
        />
      )}
    </fieldset>
  );
}
