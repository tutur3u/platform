'use client';

import { DropdownMenu } from '@tuturuuu/ui/dropdown-menu';
import { type ComponentProps, useState } from 'react';
import { useActivityModalOpen } from './activity-pane-context';

export function ActivityDropdownMenu(
  props: Omit<
    ComponentProps<typeof DropdownMenu>,
    'open' | 'defaultOpen' | 'onOpenChange'
  >
) {
  const [open, setOpen] = useState(false);
  const visible = useActivityModalOpen(open);
  if (open && !visible) setOpen(false);

  return <DropdownMenu {...props} open={visible} onOpenChange={setOpen} />;
}
