'use client';

import { FileText, Pencil, Trash2 } from '@tuturuuu/icons';
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

  if (formProps.isNew) {
    return (
      <section className="overflow-hidden rounded-2xl border border-dynamic-blue/25 bg-linear-to-br from-dynamic-blue/10 via-background to-background shadow-sm">
        <div className="flex items-start gap-3 border-dynamic-blue/15 border-b px-4 py-4 sm:px-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-dynamic-blue/15 text-dynamic-blue">
            <FileText className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <div className="font-semibold text-base">
              {t('ws-reports.create_report_title')}
            </div>
            <p className="text-muted-foreground text-sm">
              {t('ws-reports.new_report_description')}
            </p>
          </div>
        </div>
        <div className="p-4 sm:p-5">
          <UserReportForm {...formProps} />
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border bg-card p-3 shadow-xs">
      <div className="flex items-center gap-2 px-1">
        <FileText className="h-4 w-4 text-dynamic-blue" />
        <span className="font-medium text-sm">
          {t('ws-reports.report_details')}
        </span>
      </div>
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

      <div
        className={cn(
          'grid grid-cols-1 gap-2',
          formProps.onDelete && formProps.canDelete && 'sm:grid-cols-2'
        )}
      >
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="w-full gap-2" type="button" variant="outline">
              <Pencil className="h-4 w-4" />
              {t('ws-reports.edit_report')}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{t('ws-reports.basic_info')}</DialogTitle>
              <DialogDescription>
                {t('ws-reports.selected_user_description')}
              </DialogDescription>
            </DialogHeader>
            <UserReportForm {...formProps} onDelete={undefined} />
          </DialogContent>
        </Dialog>

        {formProps.onDelete && formProps.canDelete ? (
          <Button
            className="w-full gap-2"
            type="button"
            variant="destructive"
            onClick={formProps.onDelete}
          >
            <Trash2 className="h-4 w-4" />
            {t('ws-reports.delete_report')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
