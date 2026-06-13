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
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { UiDocsSidebar } from './ui-docs-sidebar';

export function UiDocsMobileNav({ locale }: { locale: string }) {
  const t = useTranslations('ui-showcase.docs.nav');
  const [open, setOpen] = useState(false);

  return (
    <div className="sticky top-0 z-20 border-b bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
      <Sheet onOpenChange={setOpen} open={open}>
        <SheetTrigger asChild>
          <Button size="sm" variant="outline">
            <Menu className="size-4" />
            {t('menu')}
          </Button>
        </SheetTrigger>
        <SheetContent className="w-[22rem] max-w-[88vw] p-0" side="left">
          <SheetHeader className="border-b text-left">
            <SheetTitle>{t('title')}</SheetTitle>
            <SheetDescription>{t('description')}</SheetDescription>
          </SheetHeader>
          <UiDocsSidebar
            className="h-[calc(100dvh-5rem)]"
            locale={locale}
            onNavigate={() => setOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}
