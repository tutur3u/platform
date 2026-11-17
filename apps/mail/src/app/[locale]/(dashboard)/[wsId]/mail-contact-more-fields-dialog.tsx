'use client';

import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useHoldMailProfile } from './mail-profile-context';

/**
 * The create form in a dialog, with room for the full workspace picker. It
 * edits the same draft as the inline form.
 */
export function MailContactMoreFieldsDialog({
  open,
  pending,
  canSubmit,
  submitLabel,
  fields,
  status,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  pending: boolean;
  canSubmit: boolean;
  submitLabel: string;
  fields: ReactNode;
  status: ReactNode;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
}) {
  const t = useTranslations('mail.profile_actions');
  useHoldMailProfile(open);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('create_title')}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          {fields}
          {status}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              {t('back')}
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
