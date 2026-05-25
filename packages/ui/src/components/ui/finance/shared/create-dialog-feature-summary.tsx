'use client';

import FeatureSummary from '@tuturuuu/ui/custom/feature-summary';
import { type ComponentProps, useEffect, useState } from 'react';

type FeatureSummaryProps = ComponentProps<typeof FeatureSummary>;

interface CreateDialogFeatureSummaryProps extends FeatureSummaryProps {
  defaultOpen?: boolean;
}

export function CreateDialogFeatureSummary({
  defaultOpen = false,
  ...props
}: CreateDialogFeatureSummaryProps) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);

  return <FeatureSummary {...props} open={open} setOpen={setOpen} />;
}
