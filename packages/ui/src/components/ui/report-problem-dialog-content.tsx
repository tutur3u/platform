'use client';

import { MessageSquareWarning } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Dialog, DialogTrigger } from '@tuturuuu/ui/dialog';
import { cn } from '@tuturuuu/utils/format';
import { useState } from 'react';
import { FeedbackDialog } from './feedback-dialog';
import type { ReportProblemDialogProps } from './report-problem-model';

/**
 * Feedback dialog in the settings dialog layout. Controlled with `open` and
 * `onOpenChange`, or uncontrolled with the optional trigger button.
 */
export function ReportProblemDialogContent({
  className,
  trigger,
  showTrigger = true,
  open,
  onOpenChange,
  ...props
}: ReportProblemDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = open !== undefined;
  const dialogOpen = isControlled ? open : internalOpen;
  const handleOpenChange = (next: boolean) => {
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  };

  return (
    <Dialog open={dialogOpen} onOpenChange={handleOpenChange}>
      {showTrigger && (
        <DialogTrigger asChild>
          {trigger || (
            <Button variant="secondary" size="sm" className={cn(className)}>
              <MessageSquareWarning className="mr-2 h-4 w-4" />
              {props.t('report-problem')}
            </Button>
          )}
        </DialogTrigger>
      )}
      {dialogOpen && (
        <FeedbackDialog {...props} open onOpenChange={handleOpenChange} />
      )}
    </Dialog>
  );
}
