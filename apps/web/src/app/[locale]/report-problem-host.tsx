'use client';

import dynamic from 'next/dynamic';
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

/**
 * Opens the feedback dialog on `tuturuuu:report-problem-open-intent`, such as
 * "Share guidance feedback" in settings. Mounted beside the user menu, not in
 * it, so the listener exists while the menu is closed.
 */
export default function ReportProblemHost() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const openFromIntent = () => setOpen(true);
    window.addEventListener(
      'tuturuuu:report-problem-open-intent',
      openFromIntent
    );
    return () =>
      window.removeEventListener(
        'tuturuuu:report-problem-open-intent',
        openFromIntent
      );
  }, []);

  return open ? (
    <ReportProblemDialog
      open={open}
      onOpenChange={setOpen}
      showTrigger={false}
    />
  ) : null;
}
