'use client';

import {
  ArrowRightLeft,
  ChevronDown,
  RotateCcw,
  Shuffle,
} from '@tuturuuu/icons';
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
  SelectValue,
} from '@tuturuuu/ui/select';
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
  type getFormToneClasses,
  getThemePreset,
} from '../theme';
import {
  getBodyTypographyClassName,
  getDisplayTypographyClassName,
  getHeadingTypographyClassName,
} from '../typography';
import {
  type FormFontId,
  getOffsetOptionId,
  getRandomOptionId,
  type StudioForm,
} from './studio-utils';
import { FontSelectCard } from './theme-picker-panel';

export function FontPreviewPanel({
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
  const headlineFontStyle = getFormFontStyle(values.theme.headlineFontId);
  const bodyFontStyle = getFormFontStyle(values.theme.bodyFontId);
  const headlineFont =
    FORM_FONT_OPTIONS.find((font) => font.id === values.theme.headlineFontId) ??
    FORM_FONT_OPTIONS[0];
  const bodyFont =
    FORM_FONT_OPTIONS.find((font) => font.id === values.theme.bodyFontId) ??
    FORM_FONT_OPTIONS[0];
  const displayTypographyClassName = getDisplayTypographyClassName(
    values.theme.typography.displaySize
  );
  const headingTypographyClassName = getHeadingTypographyClassName(
    values.theme.typography.headingSize
  );
  const bodyTypographyClassName = getBodyTypographyClassName(
    values.theme.typography.bodySize
  );

  const typographyControls: Array<{
    key: 'displaySize' | 'headingSize' | 'bodySize';
    label: string;
  }> = [
    {
      key: 'displaySize',
      label: t('settings.display_size'),
    },
    {
      key: 'headingSize',
      label: t('settings.heading_size'),
    },
    {
      key: 'bodySize',
      label: t('settings.body_size'),
    },
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
                  <CardTitle>{t('settings.font_previews')}</CardTitle>
                  <p className="text-muted-foreground text-sm">
                    {t('settings.current_fonts', {
                      headline: getFormFontLabel(values.theme.headlineFontId),
                      body: getFormFontLabel(values.theme.bodyFontId),
                    })}
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
              {t('settings.font_preview_hint')}
            </p>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
              <div className="rounded-3xl border border-border/60 bg-background/70 p-3.5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-2">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-[0.22em]">
                      {t('settings.quick_switch')}
                    </p>
                    <p className="text-sm">
                      {t('settings.current_fonts', {
                        headline: getFormFontLabel(values.theme.headlineFontId),
                        body: getFormFontLabel(values.theme.bodyFontId),
                      })}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <span
                        className="rounded-full border border-border/60 bg-background/80 px-2.5 py-1 text-xs"
                        style={headlineFontStyle}
                      >
                        {headlineFont?.label}
                      </span>
                      <span className="rounded-full border border-border/60 px-2.5 py-1 text-[10px] text-muted-foreground uppercase tracking-[0.18em]">
                        {headlineFont?.tone}
                      </span>
                      <span
                        className="rounded-full border border-border/60 bg-background/80 px-2.5 py-1 text-xs"
                        style={bodyFontStyle}
                      >
                        {bodyFont?.label}
                      </span>
                      <span className="rounded-full border border-border/60 px-2.5 py-1 text-[10px] text-muted-foreground uppercase tracking-[0.18em]">
                        {bodyFont?.tone}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(
                        'h-8 px-3',
                        toneClasses.secondaryButtonClassName
                      )}
                      onClick={() => {
                        form.setValue(
                          'theme.headlineFontId',
                          values.theme.bodyFontId,
                          {
                            shouldDirty: true,
                          }
                        );
                        form.setValue(
                          'theme.bodyFontId',
                          values.theme.headlineFontId,
                          {
                            shouldDirty: true,
                          }
                        );
                      }}
                    >
                      <ArrowRightLeft className="mr-1 h-4 w-4" />
                      {t('settings.swap_fonts')}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(
                        'h-8 px-3',
                        toneClasses.secondaryButtonClassName
                      )}
                      onClick={() => {
                        const nextHeadline = getRandomOptionId(
                          FORM_FONT_OPTIONS,
                          values.theme.headlineFontId
                        ) as FormFontId;
                        let nextBody = getRandomOptionId(
                          FORM_FONT_OPTIONS,
                          values.theme.bodyFontId
                        ) as FormFontId;

                        if (nextBody === nextHeadline) {
                          nextBody = getOffsetOptionId(
                            FORM_FONT_OPTIONS,
                            nextBody,
                            1
                          ) as FormFontId;
                        }

                        form.setValue('theme.headlineFontId', nextHeadline, {
                          shouldDirty: true,
                        });
                        form.setValue('theme.bodyFontId', nextBody, {
                          shouldDirty: true,
                        });
                      }}
                    >
                      <Shuffle className="mr-1 h-4 w-4" />
                      {t('settings.remix_fonts')}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(
                        'h-8 px-3',
                        toneClasses.secondaryButtonClassName
                      )}
                      onClick={() => {
                        form.setValue(
                          'theme.headlineFontId',
                          selectedPreset.headlineFontId,
                          {
                            shouldDirty: true,
                          }
                        );
                        form.setValue(
                          'theme.bodyFontId',
                          selectedPreset.bodyFontId,
                          {
                            shouldDirty: true,
                          }
                        );
                      }}
                    >
                      <RotateCcw className="mr-1 h-4 w-4" />
                      {t('settings.reset_fonts')}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-border/60 bg-background/70 p-3.5">
                <p className="text-[10px] text-muted-foreground uppercase tracking-[0.22em]">
                  {t('settings.pair_preview')}
                </p>
                <p
                  className={cn(
                    'mt-3 line-clamp-2 leading-[0.95]',
                    displayTypographyClassName
                  )}
                  style={headlineFontStyle}
                >
                  {values.theme.coverHeadline ||
                    t('settings.headline_sample_text')}
                </p>
                <p
                  className={cn(
                    'mt-3 text-muted-foreground leading-6',
                    bodyTypographyClassName
                  )}
                  style={bodyFontStyle}
                >
                  {values.description || t('settings.body_sample_text')}
                </p>
                <div className="mt-4 flex items-center gap-2">
                  <span
                    className={cn(
                      'h-2.5 w-16 rounded-full',
                      FORM_ACCENT_BADGE_CLASSES[values.theme.accentColor]
                    )}
                  />
                  <span className="text-muted-foreground text-xs">
                    {selectedPreset.name}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="rounded-3xl border border-border/60 bg-background/70 p-4">
                <p className="text-[10px] text-muted-foreground uppercase tracking-[0.22em]">
                  {t('settings.typography_scale')}
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {typographyControls.map(({ key, label }) => (
                    <div key={key} className="space-y-2">
                      <Label>{label}</Label>
                      <Select
                        value={values.theme.typography[key]}
                        onValueChange={(value) =>
                          form.setValue(
                            `theme.typography.${key}`,
                            value as FormStudioInput['theme']['typography'][typeof key],
                            { shouldDirty: true }
                          )
                        }
                      >
                        <SelectTrigger
                          className={cn(
                            'h-11 rounded-2xl',
                            toneClasses.fieldClassName
                          )}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sm">
                            {t('settings.size_small')}
                          </SelectItem>
                          <SelectItem value="md">
                            {t('settings.size_medium')}
                          </SelectItem>
                          <SelectItem value="lg">
                            {t('settings.size_large')}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-3xl border border-border/60 bg-background/70 p-4">
                <p className="text-[10px] text-muted-foreground uppercase tracking-[0.22em]">
                  {t('settings.scale_preview')}
                </p>
                <div className="mt-4 space-y-3">
                  <p
                    className={cn('font-semibold', displayTypographyClassName)}
                    style={headlineFontStyle}
                  >
                    {t('settings.headline_sample_text')}
                  </p>
                  <p
                    className={cn('font-semibold', headingTypographyClassName)}
                    style={headlineFontStyle}
                  >
                    {t('studio.question_title')}
                  </p>
                  <p
                    className={cn(
                      'text-muted-foreground',
                      bodyTypographyClassName
                    )}
                    style={bodyFontStyle}
                  >
                    {t('settings.body_sample_text')}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <FontSelectCard
                label={t('settings.headline_font')}
                sampleLabel={t('settings.headline_sample_label')}
                sampleText={t('settings.headline_sample_text')}
                value={values.theme.headlineFontId}
                toneClasses={toneClasses}
                onChange={(value) =>
                  form.setValue('theme.headlineFontId', value, {
                    shouldDirty: true,
                  })
                }
                onPrevious={() =>
                  form.setValue(
                    'theme.headlineFontId',
                    getOffsetOptionId(
                      FORM_FONT_OPTIONS,
                      values.theme.headlineFontId,
                      -1
                    ) as FormFontId,
                    { shouldDirty: true }
                  )
                }
                onNext={() =>
                  form.setValue(
                    'theme.headlineFontId',
                    getOffsetOptionId(
                      FORM_FONT_OPTIONS,
                      values.theme.headlineFontId,
                      1
                    ) as FormFontId,
                    { shouldDirty: true }
                  )
                }
              />
              <FontSelectCard
                label={t('settings.body_font')}
                sampleLabel={t('settings.body_sample_label')}
                sampleText={t('settings.body_sample_text')}
                value={values.theme.bodyFontId}
                toneClasses={toneClasses}
                onChange={(value) =>
                  form.setValue('theme.bodyFontId', value, {
                    shouldDirty: true,
                  })
                }
                onPrevious={() =>
                  form.setValue(
                    'theme.bodyFontId',
                    getOffsetOptionId(
                      FORM_FONT_OPTIONS,
                      values.theme.bodyFontId,
                      -1
                    ) as FormFontId,
                    { shouldDirty: true }
                  )
                }
                onNext={() =>
                  form.setValue(
                    'theme.bodyFontId',
                    getOffsetOptionId(
                      FORM_FONT_OPTIONS,
                      values.theme.bodyFontId,
                      1
                    ) as FormFontId,
                    { shouldDirty: true }
                  )
                }
              />
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
