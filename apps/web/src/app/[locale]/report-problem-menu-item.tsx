'use client';

import { AlertTriangle } from '@tuturuuu/icons';
import { DropdownMenuItem } from '@tuturuuu/ui/dropdown-menu';
import { ReportProblemDialog } from '@tuturuuu/ui/report-problem-dialog';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

export default function ReportProblemMenuItem() {
  const t = useTranslations('common');
  const [open, setOpen] = useState(false);

  return (
    <>
      <DropdownMenuItem
        className="cursor-pointer"
        onClick={(e) => {
          e.preventDefault();
          setOpen(true);
        }}
      >
        <AlertTriangle className="h-4 w-4 text-dynamic-yellow" />
        <span>{t('report-problem')}</span>
      </DropdownMenuItem>
      <ReportProblemDialog
        open={open}
        onOpenChange={setOpen}
        showTrigger={false}
      />
    </>
  );
}
