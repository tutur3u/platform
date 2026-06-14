'use client';

import { Menu } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@tuturuuu/ui/sheet';
import { useState } from 'react';
import type { SidebarData } from './ui-docs-nav-data';
import { UiDocsSidebarNav } from './ui-docs-sidebar';

export function UiDocsMobileNav({
  locale,
  data,
  onOpenCommand,
}: {
  locale: string;
  data: SidebarData;
  onOpenCommand?: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="sticky top-0 z-20 border-b bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
      <Sheet onOpenChange={setOpen} open={open}>
        <SheetTrigger asChild>
          <Button size="sm" variant="outline">
            <Menu className="size-4" />
            {data.labels.menu}
          </Button>
        </SheetTrigger>
        <SheetContent className="w-[22rem] max-w-[88vw] p-0" side="left">
          <SheetHeader className="border-b text-left">
            <SheetTitle>{data.labels.title}</SheetTitle>
            <SheetDescription>{data.labels.description}</SheetDescription>
          </SheetHeader>
          <UiDocsSidebarNav
            className="h-[calc(100dvh-5rem)]"
            groups={data.groups}
            labels={data.labels}
            locale={locale}
            onNavigate={() => setOpen(false)}
            onOpenCommand={
              onOpenCommand
                ? () => {
                    setOpen(false);
                    onOpenCommand();
                  }
                : undefined
            }
            total={data.total}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}
