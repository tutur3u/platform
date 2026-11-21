'use client';

import { KeyRound, ShieldCheck } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AccountPasswordResetDialog } from './account-password-reset-dialog';

export function AccountPasswordRecovery() {
  const t = useTranslations('internal-accounts.password_recovery');
  const [open, setOpen] = useState(false);

  return (
    <>
      <section className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-primary/5 text-primary">
            <ShieldCheck className="size-5" />
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold">{t('title')}</h2>
            <p className="mt-1 max-w-2xl text-muted-foreground text-sm">
              {t('description')}
            </p>
          </div>
        </div>
        <Button
          className="shrink-0"
          onClick={() => setOpen(true)}
          type="button"
        >
          <KeyRound className="size-4" />
          {t('action')}
        </Button>
      </section>
      <AccountPasswordResetDialog onOpenChange={setOpen} open={open} />
    </>
  );
}
