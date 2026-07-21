'use client';

import {
  ClipboardList,
  ImagePlus,
  LayoutTemplate,
  Minus,
  Play,
  Plus,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';

import { QuestionTypeIcon } from '../form-icons';
import type { FormQuestionInput } from '../schema';
import type { getFormToneClasses } from '../theme';

const RAIL_ACTIONS: Array<{
  id: 'section' | FormQuestionInput['type'];
  labelKey: string;
  icon?: typeof Plus;
}> = [
  { id: 'section', labelKey: 'studio.add_section', icon: LayoutTemplate },
  { id: 'short_text', labelKey: 'studio.add_field', icon: ClipboardList },
  { id: 'rich_text', labelKey: 'question_type.rich_text' },
  { id: 'image', labelKey: 'question_type.image', icon: ImagePlus },
  { id: 'youtube', labelKey: 'question_type.youtube', icon: Play },
  { id: 'divider', labelKey: 'question_type.divider', icon: Minus },
  { id: 'section_break', labelKey: 'question_type.section_break', icon: Plus },
];

export function FloatingBlockToolbar({
  toneClasses,
  onAddSection,
  onAddBlock,
}: {
  toneClasses: ReturnType<typeof getFormToneClasses>;
  onAddSection: () => void;
  onAddBlock: (type: FormQuestionInput['type']) => void;
}) {
  const t = useTranslations('forms');

  return (
    <div className="sticky top-[calc(var(--form-studio-sticky-top)+5.5rem)] hidden self-start xl:block">
      <div className="flex flex-col gap-2 rounded-[1.6rem] border border-border/60 bg-background/85 p-2 shadow-lg backdrop-blur">
        {RAIL_ACTIONS.map(({ id, labelKey, icon: Icon }) => (
          <Tooltip key={id}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className={cn(
                  'h-11 w-11 rounded-2xl',
                  toneClasses.secondaryButtonClassName
                )}
                onClick={() =>
                  id === 'section'
                    ? onAddSection()
                    : onAddBlock(id as FormQuestionInput['type'])
                }
              >
                {id !== 'section' ? (
                  <QuestionTypeIcon
                    type={id as FormQuestionInput['type']}
                    className="h-4 w-4"
                  />
                ) : Icon ? (
                  <Icon className="h-4 w-4" />
                ) : null}
                <span className="sr-only">{t(labelKey as any)}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">{t(labelKey as any)}</TooltipContent>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}
