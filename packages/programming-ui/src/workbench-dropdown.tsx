'use client';

import { DropdownMenu } from '@tuturuuu/ui/dropdown-menu';
import { type ReactNode, useState } from 'react';

export function WorkbenchDropdown({
  children,
  suspended = false,
}: {
  children: ReactNode;
  suspended?: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (suspended && open) setOpen(false);

  return (
    <DropdownMenu open={open && !suspended} onOpenChange={setOpen}>
      {children}
    </DropdownMenu>
  );
}
