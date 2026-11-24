'use client';

import { CircleCheck, FileText, ListTodo, Sparkles } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export const askMiraActions = ['summarize', 'decisions', 'actions'] as const;
export type AskMiraAction = (typeof askMiraActions)[number];

const icons = {
  summarize: FileText,
  decisions: CircleCheck,
  actions: ListTodo,
} as const;

/**
 * The room chat's quick questions for Mira behind one button. Choosing one
 * writes its prompt into the composer for the person to send.
 */
export function AskMiraMenu({
  disabled,
  onPick,
}: {
  disabled?: boolean;
  onPick: (action: AskMiraAction) => void;
}) {
  const t = useTranslations('meet.call');
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          aria-label={t('ask_mira')}
          className="shrink-0 gap-1.5"
        >
          <Sparkles aria-hidden className="size-4" />
          <span className="hidden @[23rem]:inline">{t('ask_mira')}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        collisionPadding={12}
        className="w-48 space-y-0.5 p-1"
      >
        {askMiraActions.map((action) => {
          const Icon = icons[action];
          return (
            <Button
              key={action}
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 pointer-coarse:h-11"
              onClick={() => {
                setOpen(false);
                onPick(action);
              }}
            >
              <Icon aria-hidden className="size-4 text-muted-foreground" />
              {t(`ask_${action}`)}
            </Button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
