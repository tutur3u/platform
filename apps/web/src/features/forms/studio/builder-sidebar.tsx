'use client';

import { Plus } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { FormsMarkdown } from '../forms-markdown';
import type { FormStudioInput } from '../schema';
import type { getFormToneClasses } from '../theme';
import {
  getBodyTypographyClassName,
  getStudioTitleTypographyClassName,
} from '../typography';

export function BuilderSidebar({
  values,
  activeSectionId,
  onAddSection,
  onSelectSection,
  toneClasses,
}: {
  values: FormStudioInput;
  activeSectionId?: string;
  onAddSection: () => void;
  onSelectSection: (sectionId: string) => void;
  toneClasses: ReturnType<typeof getFormToneClasses>;
}) {
  const t = useTranslations('forms');
  const questionCount = values.sections.reduce(
    (total, section) => total + section.questions.length,
    0
  );
  const studioTitleClassName = getStudioTitleTypographyClassName(
    values.theme.typography.headingSize
  );
  const bodyClassName = getBodyTypographyClassName(
    values.theme.typography.bodySize
  );

  return (
    <div className="space-y-4 self-start lg:sticky lg:top-[calc(var(--form-studio-sticky-top)+5.25rem)] lg:h-fit">
      <Card className="border-border/60 bg-background/80 shadow-sm">
        <CardHeader className="space-y-2 pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-base">{t('studio.structure')}</CardTitle>
            <Badge
              variant="outline"
              className="rounded-full px-2 py-0.5 text-[11px]"
            >
              {t('studio.question_count', { count: questionCount })}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {values.sections.map((section, index) => (
            <button
              key={section.id}
              type="button"
              onClick={() => {
                if (section.id) {
                  onSelectSection(section.id);
                }
              }}
              className={cn(
                'w-full rounded-2xl border px-3 py-2.5 text-left transition',
                activeSectionId === section.id
                  ? toneClasses.selectedOptionClassName
                  : 'border-border/60 bg-background/70 hover:border-foreground/15'
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className={cn('truncate', studioTitleClassName)}>
                    <span className="mr-1">{index + 1}.</span>
                    <FormsMarkdown
                      content={section.title || t('studio.untitled_section')}
                      variant="inline"
                      className="inline"
                    />
                  </div>
                  <p className={cn('text-muted-foreground', bodyClassName)}>
                    {t('studio.question_count', {
                      count: section.questions.length,
                    })}
                  </p>
                </div>
              </div>
            </button>
          ))}
          <Button
            type="button"
            variant="outline"
            className={cn('mt-2 w-full', toneClasses.secondaryButtonClassName)}
            onClick={onAddSection}
          >
            <Plus className="mr-2 h-4 w-4" />
            {t('studio.add_section')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
