'use client';

import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { useTranslations } from 'next-intl';

interface SessionScopeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (scope: 'future' | 'once') => void;
}

export function SessionScopeDialog({
  open,
  onOpenChange,
  onSelect,
}: SessionScopeDialogProps) {
  const t = useTranslations('ws-user-group-schedule');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('edit_scope_prompt_title')}</DialogTitle>
          <DialogDescription>
            {t('edit_scope_prompt_description')}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:justify-end">
          <Button variant="outline" onClick={() => onSelect('once')}>
            {t('edit_scope_once')}
          </Button>
          <Button onClick={() => onSelect('future')}>
            {t('edit_scope_future')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
