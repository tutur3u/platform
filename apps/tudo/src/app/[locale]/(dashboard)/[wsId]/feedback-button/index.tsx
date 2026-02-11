'use client';

import { MessageSquareWarning } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { ReportProblemDialog } from '@tuturuuu/ui/report-problem-dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface FeedbackButtonProps {
  isCollapsed: boolean;
}

export function FeedbackButton({ isCollapsed }: FeedbackButtonProps) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);

  if (isCollapsed) {
    return (
      <>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 shrink-0"
              onClick={() => setOpen(true)}
            >
              <MessageSquareWarning className="h-5 w-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p>{t('common.report-problem')}</p>
          </TooltipContent>
        </Tooltip>
        <ReportProblemDialog
          open={open}
          onOpenChange={setOpen}
          showTrigger={false}
        />
      </>
    );
  }

  return (
    <div className="w-full">
      <Button
        variant="ghost"
        className="h-10 w-full justify-start gap-2"
        onClick={() => setOpen(true)}
      >
        <MessageSquareWarning className="h-5 w-5 shrink-0" />
        <span className="line-clamp-1">{t('common.report-problem')}</span>
      </Button>
      <ReportProblemDialog
        open={open}
        onOpenChange={setOpen}
        showTrigger={false}
      />
    </div>
  );
}
