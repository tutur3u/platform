'use client';

import { ZoomIn } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { Progress } from '@tuturuuu/ui/progress';
import { cn } from '@tuturuuu/utils/format';
import Image from 'next/image';
import type { CSSProperties, Dispatch, SetStateAction } from 'react';
import { normalizeMarkdownToText } from '../content';
import { FormsMarkdown } from '../forms-markdown';
import type { getRuntimeProgressStats } from '../runtime-progress';
import type { FormDefinition } from '../types';
import { ExpandableDescriptionPanel } from './expandable-description-panel';
import type { FormsTranslator, FormToneClasses } from './types';

export function renderFormHeroCard({
  form,
  t,
  toneClasses,
  headlineFontStyle,
  displayTypographyClassName,
  progressStats,
  setPreviewImage,
}: {
  form: FormDefinition;
  t: FormsTranslator;
  toneClasses: FormToneClasses;
  headlineFontStyle: CSSProperties;
  displayTypographyClassName: string;
  progressStats: ReturnType<typeof getRuntimeProgressStats>;
  setPreviewImage: Dispatch<
    SetStateAction<{ src: string; alt: string } | null>
  >;
}) {
  return (
    <Card className={cn('overflow-hidden border-0', toneClasses.heroClassName)}>
      {form.theme.coverImage.url ? (
        <div className="relative aspect-video w-full overflow-hidden md:aspect-16/6">
          <Image
            src={form.theme.coverImage.url}
            alt={
              form.theme.coverImage.alt || normalizeMarkdownToText(form.title)
            }
            fill
            unoptimized
            className="object-cover"
          />
          <div className="absolute inset-0 bg-linear-to-t from-background via-background/35 to-transparent" />
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="absolute top-4 right-4 h-10 w-10 rounded-full bg-background/85 shadow-sm backdrop-blur-sm"
            onClick={() =>
              setPreviewImage({
                src: form.theme.coverImage.url,
                alt:
                  form.theme.coverImage.alt ||
                  normalizeMarkdownToText(form.title),
              })
            }
          >
            <ZoomIn className="h-4 w-4" />
            <span className="sr-only">
              {t('runtime.view_image_fullscreen')}
            </span>
          </Button>
          <div className="absolute inset-x-0 bottom-0 p-6 lg:p-8">
            <div className="space-y-3">
              <div
                className={cn(
                  'max-w-4xl font-semibold text-primary-foreground leading-tight',
                  displayTypographyClassName
                )}
                style={headlineFontStyle}
              >
                <FormsMarkdown
                  content={form.theme.coverHeadline || form.title}
                  className="[&_a]:text-primary-foreground [&_p]:m-0 [&_p]:leading-tight"
                />
              </div>
            </div>
          </div>
        </div>
      ) : null}
      <CardContent className="space-y-5 p-6 lg:p-8">
        {!form.theme.coverImage.url ? (
          <div className="space-y-5">
            <div className="space-y-3">
              <div
                className={cn(
                  'font-semibold leading-tight',
                  displayTypographyClassName
                )}
                style={headlineFontStyle}
              >
                <FormsMarkdown
                  content={form.theme.coverHeadline || form.title}
                  className="[&_p]:m-0 [&_p]:leading-tight"
                />
              </div>
            </div>
          </div>
        ) : null}
        {form.description ? (
          <div className="rounded-[1.65rem] border border-border/60 bg-background/45 p-5 sm:p-6">
            <ExpandableDescriptionPanel content={form.description} />
          </div>
        ) : null}
        {form.settings.showProgressBar ? (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] uppercase tracking-[0.25em] opacity-60">
              <span>{t('runtime.completion')}</span>
              <span>
                {t('runtime.questions_completed', {
                  completed: progressStats.completedCount,
                  total: progressStats.totalQuestions,
                })}
              </span>
            </div>
            <Progress
              value={progressStats.progressValue}
              className={cn('h-2.5', toneClasses.progressClassName)}
              indicatorClassName={toneClasses.progressIndicatorClassName}
            />
            <div className="flex flex-wrap items-center justify-between gap-3 text-muted-foreground text-xs">
              <span>{Math.round(progressStats.progressValue)}%</span>
              <span>
                {t('runtime.progress_breakdown', {
                  filled: progressStats.answeredCount,
                  skipped: progressStats.skippedCount,
                })}
              </span>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
