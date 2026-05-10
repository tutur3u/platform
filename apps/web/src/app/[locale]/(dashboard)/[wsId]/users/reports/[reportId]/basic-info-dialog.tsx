'use client';

import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import UserReportForm from './form';
import type { UserReportFormProps } from './form-types';

interface ReportBasicInfoDialogProps extends UserReportFormProps {
  contentValue?: string;
  feedbackValue?: string;
  titleValue?: string;
}

function BasicInfoPreview({
  label,
  multiline = false,
  value,
}: {
  label: string;
  multiline?: boolean;
  value?: string;
}) {
  const displayValue = value?.trim();

  return (
    <div className="rounded-lg border bg-muted/20 px-3 py-2">
      <div className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {label}
      </div>
      <div
        className={cn(
          'mt-1 text-sm',
          multiline ? 'line-clamp-3 whitespace-pre-wrap' : 'truncate',
          !displayValue && 'text-muted-foreground'
        )}
      >
        {displayValue || label}
      </div>
    </div>
  );
}

export function ReportBasicInfoDialog({
  contentValue,
  feedbackValue,
  titleValue,
  ...formProps
}: ReportBasicInfoDialogProps) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-3">
      <div className="grid gap-2">
        <BasicInfoPreview
          label={t('user-report-data-table.title')}
          value={titleValue}
        />
        <BasicInfoPreview
          label={t('user-report-data-table.content')}
          multiline
          value={contentValue}
        />
        <BasicInfoPreview
          label={t('user-report-data-table.feedback')}
          multiline
          value={feedbackValue}
        />
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button className="w-full" type="button" variant="outline">
            {t('common.edit')}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t('ws-reports.basic_info')}</DialogTitle>
            <DialogDescription>
              {t('ws-reports.selected_user_description')}
            </DialogDescription>
          </DialogHeader>
          <UserReportForm {...formProps} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
