'use client';

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@tuturuuu/ui/sheet';
import type { ReactElement, ReactNode } from 'react';
import { useMeetFormsCopy } from './meet-forms-copy';
import { MeetFormsPanel, type MeetFormsPanelProps } from './meet-forms-panel';

interface MeetFormsSheetProps extends MeetFormsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger?: ReactElement;
  precedingContent?: ReactNode;
  hideResponder?: boolean;
}

export function MeetFormsSheet({
  open,
  onOpenChange,
  trigger,
  precedingContent,
  hideResponder,
  ...panel
}: MeetFormsSheetProps) {
  const copy = useMeetFormsCopy();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {trigger && <SheetTrigger asChild>{trigger}</SheetTrigger>}
      <SheetContent
        side="bottom"
        aria-describedby={undefined}
        className="ttr-sorbet-font mx-auto max-h-[82dvh] max-w-sm gap-0 rounded-t-[28px] bg-popover text-popover-foreground"
      >
        <div
          aria-hidden="true"
          className="mx-auto mt-2.5 h-1 w-9 shrink-0 rounded-full bg-muted-foreground/35"
        />
        <SheetHeader className="shrink-0">
          <SheetTitle>{copy.title}</SheetTitle>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <div className="space-y-3">
            {precedingContent}
            {!hideResponder && <MeetFormsPanel {...panel} />}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
