'use client';

import { AlertTriangle } from '@tuturuuu/icons/lucide-static';
import { DropdownMenuItem } from '@tuturuuu/ui/dropdown-menu';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

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

  useEffect(() => {
    const openFromGuidance = () => setOpen(true);
    window.addEventListener(
      'tuturuuu:report-problem-open-intent',
      openFromGuidance
    );
    return () =>
      window.removeEventListener(
        'tuturuuu:report-problem-open-intent',
        openFromGuidance
      );
  }, []);

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
