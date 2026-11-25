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
import { useEffect, useId, useSyncExternalStore } from 'react';

const prompts = new Set<string>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const currentPrompt = (): string | undefined => prompts.values().next().value;
const updatePrompts = () => listeners.forEach((listener) => listener());

export function MiraConfirmDialog({
  open,
  pending,
  failed,
  host = false,
  account = true,
  onConfirm,
  onDismiss,
  returnFocus,
}: {
  open: boolean;
  pending: boolean;
  failed: boolean;
  host?: boolean;
  account?: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
  returnFocus?: () => void;
}) {
  const t = useTranslations('meet.mira_consent');
  const id = useId();
  const owner = useSyncExternalStore(subscribe, currentPrompt, () => undefined);
  // A host can turn Mira on while someone is confirming in Private Mira.
  // Keep one dialog visible while the other surface reads the saved choice.
  useEffect(() => {
    if (!open) return;
    prompts.add(id);
    updatePrompts();
    return () => {
      prompts.delete(id);
      updatePrompts();
    };
  }, [id, open]);
  return (
    <Dialog
      open={open && owner === id}
      onOpenChange={(next) => {
        if (!next && !pending) onDismiss();
      }}
    >
      <DialogContent
        onCloseAutoFocus={(event) => {
          if (!returnFocus) return;
          event.preventDefault();
          returnFocus();
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {t(host ? 'host_turn_on' : 'account_title')}
          </DialogTitle>
          <DialogDescription>
            {account ? t('account_statement') : t('host_adults')}
          </DialogDescription>
        </DialogHeader>
        {host && (
          <p className="text-sm text-muted-foreground">
            {account && <>{t('host_adults')}. </>}
            {t('host_terms_v2')}
          </p>
        )}
        {failed && (
          <p className="text-destructive text-sm" role="alert">
            {t('save_failed')}
          </p>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={onDismiss}
          >
            {t('not_now')}
          </Button>
          <Button type="button" disabled={pending} onClick={onConfirm}>
            {t('confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
