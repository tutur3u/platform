'use client';

import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@tuturuuu/ui/select';
import { Slider } from '@tuturuuu/ui/slider';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import {
  FORM_FONT_OPTIONS,
  getFormFontLabel,
  getFormFontStyle,
} from '../fonts';
import type { FormStudioInput } from '../schema';
import {
  FORM_ACCENT_BADGE_CLASSES,
  FORM_PRESET_PALETTES,
  FORM_THEME_PRESETS,
  getFormToneClasses,
  getThemePreset,
} from '../theme';
import {
  applyThemePreset,
  type FormFontId,
  getOffsetOptionId,
  getRandomOptionId,
  type StudioForm,
} from './studio-utils';

export function ThemePickerPanel({
  values,
  form,
  toneClasses,
}: {
  values: FormStudioInput;
  form: StudioForm;
  toneClasses: ReturnType<typeof getFormToneClasses>;
}) {
  const t = useTranslations('forms');
  const [open, setOpen] = useState(false);
  const selectedPreset = getThemePreset(values.theme.presetId);
  const selectedPresetIndex = Math.max(
    0,
    FORM_THEME_PRESETS.findIndex((preset) => preset.id === selectedPreset.id)
  );
  const selectedHeadlineFontStyle = getFormFontStyle(
    values.theme.headlineFontId
  );
  const selectedPalette = FORM_PRESET_PALETTES[selectedPreset.id] ?? [
    selectedPreset.accentColor,
  ];

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="overflow-hidden border-border/60 bg-card/80 shadow-sm">
        <CardHeader className="p-0">
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className="h-auto w-full justify-start rounded-none px-6 py-5 hover:bg-transparent"
            >
              <div className="flex w-full items-start justify-between gap-4 text-left">
                <div className="space-y-1">
                  <CardTitle>{t('settings.design_presets')}</CardTitle>
                  <p className="text-muted-foreground text-sm">
                    {selectedPreset.name}
                  </p>
                </div>
                <ChevronDown
                  className={cn(
                    'mt-1 h-4 w-4 shrink-0 transition-transform',
                    open && 'rotate-180'
                  )}
                />
              </div>
            </Button>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent className="overflow-hidden border-border/60 border-t data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
          <CardContent className="space-y-4 px-6 pt-5 pb-5">
            <p className="text-muted-foreground text-sm">
              {t('settings.theme_picker_hint')}
            </p>

            <div
              className={cn(
                'overflow-hidden rounded-[1.75rem] border p-4',
                toneClasses.heroClassName
              )}
            >
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_240px]">
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2">
                      <p className="text-[10px] uppercase tracking-[0.28em] opacity-70">
                        {t('settings.selected_theme')}
                      </p>
                      <h3
                        className="text-2xl leading-tight"
                        style={selectedHeadlineFontStyle}
                      >
                        {selectedPreset.name}
                      </h3>
                    </div>
                    <div className="shrink-0 rounded-full border border-border/60 bg-background/80 px-3 py-1 text-[11px] text-muted-foreground uppercase tracking-[0.2em]">
                      {selectedPreset.surfaceStyle}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {selectedPalette.map((accent) => (
                      <span
                        key={`${selectedPreset.id}-${accent}`}
                        className={cn(
                          'h-3.5 w-10 rounded-full shadow-sm',
                          FORM_ACCENT_BADGE_CLASSES[accent]
                        )}
                      />
                    ))}
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {t('settings.current_theme', {
                      theme: selectedPreset.name,
                    })}
                  </p>
                </div>

                <div className="rounded-[1.35rem] border border-border/60 bg-background/75 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-[0.2em]">
                      {t('tabs.preview')}
                    </p>
                    <Badge
                      variant="outline"
                      className="rounded-full px-2 py-0.5 text-[10px]"
                    >
                      {t('settings.active')}
                    </Badge>
                  </div>
                  <div className="mt-3 flex gap-1.5">
                    {selectedPalette.map((accent) => (
                      <span
                        key={`${selectedPreset.id}-chip-${accent}`}
                        className={cn(
                          'h-2.5 w-full rounded-full',
                          FORM_ACCENT_BADGE_CLASSES[accent]
                        )}
                      />
                    ))}
                  </div>
                  <div className="mt-3 rounded-full bg-background/80 p-1">
                    <div
                      className={cn(
                        'h-2 w-2/3 rounded-full',
                        FORM_ACCENT_BADGE_CLASSES[selectedPreset.accentColor]
                      )}
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <div
                      className={cn(
                        'rounded-full px-3 py-1 font-medium text-xs',
                        toneClasses.primaryButtonClassName
                      )}
                    >
                      {t('runtime.submit_response')}
                    </div>
                    <div
                      className={cn(
                        'rounded-full px-3 py-1 text-xs',
                        toneClasses.secondaryButtonClassName
                      )}
                    >
                      {t('runtime.preview')}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-border/60 bg-background/70 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[10px] text-muted-foreground uppercase tracking-[0.22em]">
                  {t('settings.quick_switch')}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      'h-8 px-3',
                      toneClasses.secondaryButtonClassName
                    )}
                    onClick={() =>
                      applyThemePreset(
                        form,
                        getOffsetOptionId(
                          FORM_THEME_PRESETS,
                          selectedPreset.id,
                          -1
                        )
                      )
                    }
                  >
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    {t('settings.previous_theme')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      'h-8 px-3',
                      toneClasses.secondaryButtonClassName
                    )}
                    onClick={() =>
                      applyThemePreset(
                        form,
                        getRandomOptionId(FORM_THEME_PRESETS, selectedPreset.id)
                      )
                    }
                  >
                    <Sparkles className="mr-1 h-4 w-4" />
                    {t('settings.random_theme')}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      'h-8 px-3',
                      toneClasses.secondaryButtonClassName
                    )}
                    onClick={() =>
                      applyThemePreset(
                        form,
                        getOffsetOptionId(
                          FORM_THEME_PRESETS,
                          selectedPreset.id,
                          1
                        )
                      )
                    }
                  >
                    {t('settings.next_theme')}
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <Slider
                  min={0}
                  max={FORM_THEME_PRESETS.length - 1}
                  step={1}
                  value={[selectedPresetIndex]}
                  onValueChange={(nextValue) => {
                    const nextPreset = FORM_THEME_PRESETS[nextValue[0] ?? 0];

                    if (nextPreset) {
                      applyThemePreset(form, nextPreset.id);
                    }
                  }}
                  className="py-1"
                />
                <Badge
                  variant="outline"
                  className="rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.2em]"
                >
                  {t('settings.theme_position', {
                    current: selectedPresetIndex + 1,
                    total: FORM_THEME_PRESETS.length,
                  })}
                </Badge>
              </div>
            </div>

            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {FORM_THEME_PRESETS.map((preset) => {
                const selected = values.theme.presetId === preset.id;
                const presetToneClasses = getFormToneClasses(
                  preset.accentColor
                );
                const palette = FORM_PRESET_PALETTES[preset.id] ?? [
                  preset.accentColor,
                ];

                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyThemePreset(form, preset.id)}
                    className={cn(
                      'rounded-[1.35rem] border p-3 text-left transition',
                      selected
                        ? presetToneClasses.selectedOptionClassName
                        : 'border-border/60 bg-background/70 hover:border-foreground/20'
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-sm">
                          {preset.name}
                        </p>
                        <p className="truncate text-[11px] opacity-75">
                          {preset.surfaceStyle}
                        </p>
                      </div>
                      {selected ? (
                        <Badge
                          variant="secondary"
                          className="rounded-full px-2 py-0.5 text-[10px]"
                        >
                          {t('settings.active')}
                        </Badge>
                      ) : null}
                    </div>
                    <div
                      className={cn(
                        'mt-3 h-10 rounded-[0.9rem] border',
                        presetToneClasses.previewClassName
                      )}
                    />
                    <div className="mt-3 flex gap-1">
                      {palette.map((accent) => (
                        <span
                          key={`${preset.id}-${accent}`}
                          className={cn(
                            'h-2.5 w-full rounded-full',
                            FORM_ACCENT_BADGE_CLASSES[accent]
                          )}
                        />
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

export function FontSelectCard({
  label,
  sampleLabel,
  sampleText,
  value,
  toneClasses,
  onChange,
  onPrevious,
  onNext,
}: {
  label: string;
  sampleLabel: string;
  sampleText: string;
  value: FormFontId;
  toneClasses: ReturnType<typeof getFormToneClasses>;
  onChange: (value: FormFontId) => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const t = useTranslations('forms');
  const selectedFont = FORM_FONT_OPTIONS.find((font) => font.id === value);
  const currentFont = selectedFont ?? FORM_FONT_OPTIONS[0]!;
  const fontStyle = getFormFontStyle(value);

  return (
    <div className="space-y-2.5 rounded-3xl border border-border/60 bg-background/70 p-3.5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Label>{label}</Label>
          <p className="mt-1 text-[11px] text-muted-foreground uppercase tracking-[0.2em]">
            {selectedFont?.tone ?? getFormFontLabel(value)}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            className={cn('h-8 w-8 p-0', toneClasses.secondaryButtonClassName)}
            onClick={onPrevious}
            aria-label={t('settings.previous_font')}
            title={t('settings.previous_font')}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            className={cn('h-8 w-8 p-0', toneClasses.secondaryButtonClassName)}
            onClick={onNext}
            aria-label={t('settings.next_font')}
            title={t('settings.next_font')}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <Select
        value={value}
        onValueChange={(nextValue) => onChange(nextValue as FormFontId)}
      >
        <SelectTrigger
          className={cn(
            'h-auto min-h-14 px-4 py-3 text-left',
            toneClasses.fieldClassName
          )}
        >
          <div className="flex min-w-0 flex-1 items-start justify-between gap-3 text-left">
            <div className="min-w-0" style={fontStyle}>
              <p className="truncate text-base leading-tight">
                {currentFont.label}
              </p>
              <p className="mt-1 truncate text-muted-foreground text-xs leading-snug">
                {currentFont.sample}
              </p>
            </div>
          </div>
        </SelectTrigger>
        <SelectContent>
          {FORM_FONT_OPTIONS.map((font) => (
            <SelectItem
              key={font.id}
              value={font.id}
              className="items-start py-2 pr-10"
            >
              <div className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-3 text-left">
                <div className="min-w-0">
                  <p
                    className="truncate text-base leading-tight"
                    style={getFormFontStyle(font.id)}
                  >
                    {font.label}
                  </p>
                  <p
                    className="mt-1 truncate text-muted-foreground text-xs leading-snug"
                    style={getFormFontStyle(font.id)}
                  >
                    {font.sample}
                  </p>
                </div>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div
        className="rounded-[1.2rem] border border-border/60 bg-background/80 p-3.5"
        style={fontStyle}
      >
        <p className="text-[10px] text-muted-foreground uppercase tracking-[0.22em]">
          {sampleLabel}
        </p>
        <p className="mt-2 text-2xl leading-none">{sampleText}</p>
        {selectedFont ? (
          <p className="mt-2.5 text-muted-foreground text-sm leading-6">
            {selectedFont.sample}
          </p>
        ) : null}
      </div>
    </div>
  );
}
