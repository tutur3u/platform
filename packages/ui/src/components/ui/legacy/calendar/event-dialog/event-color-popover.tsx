'use client';

import { ChevronDown } from '@tuturuuu/icons';
import type { SupportedColor } from '@tuturuuu/types/primitives/SupportedColors';
import { Button } from '@tuturuuu/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { fieldFocusClassName } from '../../../field-focus';
import { ColorPicker, colorMap } from '../settings/color-picker';

/**
 * A compact event color control: a field-shaped swatch button that opens the
 * color swatches, so the color no longer takes a full row.
 */
export function EventColorPopover({
  value,
  onChange,
  disabled,
}: {
  value: SupportedColor;
  onChange: (value: SupportedColor) => void;
  disabled?: boolean;
}) {
  const t = useTranslations('calendar.event_dialog');
  const [open, setOpen] = useState(false);
  const color = colorMap[value];
  const colorName = color?.name ?? value;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          aria-label={t('color_value', { color: colorName })}
          className={cn('h-9 shrink-0 gap-1.5 px-2.5', fieldFocusClassName)}
          data-sorbet-shape="field"
          disabled={disabled}
          type="button"
          variant="outline"
        >
          <span
            aria-hidden="true"
            className={cn(
              'size-4 rounded-full ring-1 ring-foreground/10 ring-inset',
              color?.cbg ?? 'bg-muted-foreground'
            )}
          />
          <ChevronDown aria-hidden="true" className="size-3.5 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto max-w-64 p-3">
        <p className="mb-2 font-medium text-muted-foreground text-xs">
          {t('color_label')}
        </p>
        <ColorPicker
          value={value}
          onChange={(next) => {
            onChange(next);
            setOpen(false);
          }}
          showTooltips
          size="md"
        />
      </PopoverContent>
    </Popover>
  );
}
