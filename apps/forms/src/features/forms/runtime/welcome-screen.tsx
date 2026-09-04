'use client';

import { ArrowRight } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent } from '@tuturuuu/ui/card';
import { cn } from '@tuturuuu/utils/format';
import type { CSSProperties } from 'react';
import { FormsMarkdown } from '../forms-markdown';
import type { FormDefinition } from '../types';
import type { FormsTranslator, FormToneClasses } from './types';

/**
 * Optional cover screen shown before the first question.
 *
 * Its job is to set expectations — what this is, how long it takes — before
 * someone commits to answering. Falls back to the form's own title and
 * description so enabling it is useful without writing anything new.
 */
export function WelcomeScreen({
  bodyTypographyClassName,
  displayTypographyClassName,
  form,
  headlineFontStyle,
  onStart,
  t,
  toneClasses,
}: {
  bodyTypographyClassName: string;
  displayTypographyClassName: string;
  form: FormDefinition;
  headlineFontStyle: CSSProperties;
  onStart: () => void;
  t: FormsTranslator;
  toneClasses: FormToneClasses;
}) {
  const title =
    form.settings.welcomeTitle.trim() ||
    form.theme.coverHeadline.trim() ||
    form.title;
  const description =
    form.settings.welcomeDescription.trim() || form.description;
  const buttonLabel =
    form.settings.welcomeButtonLabel.trim() || t('runtime.welcome_start');

  const questionCount = form.sections.reduce(
    (count, section) =>
      count +
      section.questions.filter((question) => question.type !== 'divider')
        .length,
    0
  );

  return (
    <Card className={cn('overflow-hidden border-0', toneClasses.heroClassName)}>
      <CardContent className="flex flex-col items-start gap-6 p-8 sm:p-12">
        <div className="space-y-4">
          <h1
            className={cn('font-semibold', displayTypographyClassName)}
            style={headlineFontStyle}
          >
            <FormsMarkdown
              className="[&_p]:m-0"
              content={title}
              variant="inline"
            />
          </h1>

          {description ? (
            <div
              className={cn('text-muted-foreground', bodyTypographyClassName)}
            >
              <FormsMarkdown content={description} />
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <Button
            className={cn(
              'rounded-2xl px-6',
              toneClasses.primaryButtonClassName
            )}
            onClick={onStart}
            size="lg"
            type="button"
          >
            {buttonLabel}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>

          <p className="text-muted-foreground text-sm">
            {t('runtime.welcome_question_count', { count: questionCount })}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
