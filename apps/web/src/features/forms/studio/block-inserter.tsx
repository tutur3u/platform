'use client';

import { Plus } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
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
        'group flex h-auto w-full flex-col items-start gap-2.5 rounded-2xl border-border/50 p-3.5 text-left transition-all hover:border-foreground/20 hover:bg-muted/50',
        toneClasses.secondaryButtonClassName
      )}
      onClick={() => onSelect(type)}
    >
      <div className="flex w-full items-start justify-between">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/60 bg-background/80 text-muted-foreground transition-colors group-hover:border-foreground/10 group-hover:text-foreground">
          <QuestionTypeIcon type={type} className="h-4 w-4" />
        </span>
      </div>
      <div className="space-y-1">
        <span className="block font-semibold text-sm">
          {t(`question_type.${type}`)}
        </span>
        <span className="line-clamp-2 block text-[10px] text-muted-foreground leading-tight opacity-70 group-hover:opacity-100">
          {t(`question_type_description.${type}`)}
        </span>
      </div>
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
            'group relative transition-all duration-300',
            compact
              ? 'h-8 w-8 rounded-full border-border/40 hover:h-9 hover:w-9 hover:border-border/80'
              : 'rounded-full border-border/60 border-dashed px-4 hover:border-border/80',
            toneClasses.secondaryButtonClassName
          )}
        >
          <Plus
            className={cn(
              'h-4 w-4 transition-transform duration-300 group-hover:rotate-90',
              !compact && 'mr-2'
            )}
          />
          {compact ? (
            <span className="sr-only">{t('studio.add_block')}</span>
          ) : (
            t('studio.add_block')
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="center"
        side="bottom"
        sideOffset={12}
        onWheel={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        className="z-[100] w-[min(92vw,42rem)] overflow-hidden rounded-[2rem] p-0 shadow-2xl"
      >
        <div className="scrollbar-thin scrollbar-thumb-border/60 scrollbar-track-transparent max-h-[min(80vh,32rem)] w-full overflow-y-auto">
          <div className="grid gap-6 p-6">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-border/40" />
                <p className="font-bold text-[10px] text-muted-foreground uppercase tracking-[0.25em]">
                  {t('studio.fields')}
                </p>
                <span className="h-px flex-1 bg-border/40" />
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {FIELD_BLOCK_TYPES.map((type) => (
                  <InsertChip
                    key={type}
                    type={type}
                    onSelect={handleSelect}
                    toneClasses={toneClasses}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-border/40" />
                <p className="font-bold text-[10px] text-muted-foreground uppercase tracking-[0.25em]">
                  {t('studio.content')}
                </p>
                <span className="h-px flex-1 bg-border/40" />
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {CONTENT_BLOCK_TYPES.map((type) => (
                  <InsertChip
                    key={type}
                    type={type}
                    onSelect={handleSelect}
                    toneClasses={toneClasses}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
