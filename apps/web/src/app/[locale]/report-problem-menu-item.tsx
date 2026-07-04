'use client';

import { AlertTriangle } from '@tuturuuu/icons/lucide-static';
import { DropdownMenuItem } from '@tuturuuu/ui/dropdown-menu';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

const ReportProblemDialog = dynamic<{
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showTrigger?: boolean;
}>(
  () =>
    import('@tuturuuu/ui/report-problem-dialog').then(
      (module) => module.ReportProblemDialog
    ),
  { ssr: false }
);

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
      {open && (
        <ReportProblemDialog
          open={open}
          onOpenChange={setOpen}
          showTrigger={false}
        />
      )}
    </>
  );
}
