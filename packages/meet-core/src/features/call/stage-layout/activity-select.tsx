'use client';

import { Select } from '@tuturuuu/ui/select';
import { type ComponentProps, useState } from 'react';
import { useActivityModalOpen } from './activity-pane-context';

export function ActivitySelect(
  props: Omit<
    ComponentProps<typeof Select>,
    'open' | 'defaultOpen' | 'onOpenChange'
  >
) {
  const [open, setOpen] = useState(false);
  const visible = useActivityModalOpen(open);
  if (open && !visible) setOpen(false);

  return <Select {...props} open={visible} onOpenChange={setOpen} />;
}
