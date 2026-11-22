'use client';

import { FolderPlus, Plus, Upload } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@tuturuuu/ui/drawer';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

/**
 * The phone-only New action: a floating button above the product dock that
 * opens a bottom sheet. The dock keeps destinations only; Back stays with
 * browser history.
 */
export function DriveMobileNew({
  folderLabel,
  onNewFolder,
  onUpload,
}: {
  folderLabel: string;
  onNewFolder: () => void;
  onUpload: () => void;
}) {
  const t = useTranslations('drive');
  const [open, setOpen] = useState(false);
  const choose = (action: () => void) => {
    setOpen(false);
    action();
  };

  return (
    <>
      <Button
        aria-label={t('actions.new')}
        className="fixed right-4 bottom-[calc(var(--sorbet-content-bottom-clearance,0px)+1rem)] z-30 size-14 rounded-full shadow-elevation-2 md:hidden"
        onClick={() => setOpen(true)}
        size="icon"
        type="button"
      >
        <Plus className="size-6" />
      </Button>
      <Drawer onOpenChange={setOpen} open={open}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>
              {t('actions.add_to', { folder: folderLabel })}
            </DrawerTitle>
          </DrawerHeader>
          <div className="grid grid-cols-2 gap-3 px-4 pb-6">
            <Button
              className="h-auto flex-col gap-2 py-4"
              onClick={() => choose(onUpload)}
              type="button"
              variant="outline"
            >
              <Upload className="size-5" />
              {t('actions.upload')}
            </Button>
            <Button
              className="h-auto flex-col gap-2 py-4"
              onClick={() => choose(onNewFolder)}
              type="button"
              variant="outline"
            >
              <FolderPlus className="size-5" />
              {t('actions.new_folder')}
            </Button>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
