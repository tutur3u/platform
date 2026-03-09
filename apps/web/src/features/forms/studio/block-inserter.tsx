'use client';

import { Plus } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { ScrollArea, ScrollBar } from '@tuturuuu/ui/scroll-area';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { QuestionTypeIcon } from '../form-icons';
import type { FormQuestionInput } from '../schema';
import type { getFormToneClasses } from '../theme';
import { CONTENT_BLOCK_TYPES, FIELD_BLOCK_TYPES } from './block-catalog';

function InsertChip({
  type,
  onSelect,
  toneClasses,
}: {
  type: FormQuestionInput['type'];
  onSelect: (type: FormQuestionInput['type']) => void;
  toneClasses: ReturnType<typeof getFormToneClasses>;
}) {
  const t = useTranslations('forms');

  return (
    <Button
      type="button"
      variant="outline"
      className={cn(
        'h-auto min-w-40 flex-col items-start gap-2 rounded-3xl px-4 py-3 text-left',
        toneClasses.secondaryButtonClassName
      )}
      onClick={() => onSelect(type)}
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-2xl border border-border/60 bg-background/80 text-muted-foreground">
        <QuestionTypeIcon type={type} className="h-4 w-4" />
      </span>
      <span className="font-semibold text-sm">
        {t(`question_type.${type}`)}
      </span>
    </Button>
  );
}

export function BlockInserter({
  onSelect,
  toneClasses,
  compact = false,
}: {
  onSelect: (type: FormQuestionInput['type']) => void;
  toneClasses: ReturnType<typeof getFormToneClasses>;
  compact?: boolean;
}) {
  const t = useTranslations('forms');
  const [open, setOpen] = useState(false);

  const handleSelect = (type: FormQuestionInput['type']) => {
    onSelect(type);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size={compact ? 'icon' : 'sm'}
          variant="outline"
          className={cn(
            compact
              ? 'h-9 w-9 rounded-full'
              : 'rounded-full border-dashed px-4',
            toneClasses.secondaryButtonClassName
          )}
        >
          <Plus className={cn('h-4 w-4', !compact && 'mr-2')} />
          {compact ? (
            <span className="sr-only">{t('studio.add_block')}</span>
          ) : (
            t('studio.add_block')
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(92vw,48rem)] rounded-[1.75rem] p-4"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="font-medium text-muted-foreground text-xs uppercase tracking-[0.22em]">
              {t('studio.fields')}
            </p>
            <ScrollArea className="w-full whitespace-nowrap">
              <div className="flex gap-3 pb-2">
                {FIELD_BLOCK_TYPES.map((type) => (
                  <InsertChip
                    key={type}
                    type={type}
                    onSelect={handleSelect}
                    toneClasses={toneClasses}
                  />
                ))}
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </div>
          <div className="space-y-2">
            <p className="font-medium text-muted-foreground text-xs uppercase tracking-[0.22em]">
              {t('studio.content')}
            </p>
            <ScrollArea className="w-full whitespace-nowrap">
              <div className="flex gap-3 pb-2">
                {CONTENT_BLOCK_TYPES.map((type) => (
                  <InsertChip
                    key={type}
                    type={type}
                    onSelect={handleSelect}
                    toneClasses={toneClasses}
                  />
                ))}
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
