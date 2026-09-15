'use client';
import { Button } from '@tuturuuu/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';
import type { ComponentProps } from 'react';

export function MailIconButton({
  className,
  ...props
}: ComponentProps<typeof Button>) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          {...props}
          className={cn('size-8 shrink-0', className)}
        />
      </TooltipTrigger>
      <TooltipContent>{props['aria-label']}</TooltipContent>
    </Tooltip>
  );
}
