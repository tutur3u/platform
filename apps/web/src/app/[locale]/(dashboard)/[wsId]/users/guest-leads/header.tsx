'use client';

import { Settings } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { GuestLeadSettingsForm } from './settings-form';

interface Props {
  wsId: string;
  settingsRow: {
    guest_user_checkup_threshold: number | null;
  } | null;
  canCreateLeadGenerations: boolean;
}

export function GuestLeadHeader({ wsId, settingsRow, canCreateLeadGenerations }: Props) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);

  const hasThreshold = !!settingsRow?.guest_user_checkup_threshold;

  return (
    <div className="flex flex-col justify-between gap-4 rounded-lg border border-border bg-foreground/5 p-4 md:flex-row md:items-start">
      <div className="w-full">
        <h1 className="w-full font-bold text-2xl">
          {t('users.guest_leads.plural')}
        </h1>
        <div className="whitespace-pre-wrap text-foreground/80">
          {t('users.guest_leads.description')}
        </div>
      </div>
      <div className="flex flex-col items-center justify-center gap-2 md:flex-row">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            {!hasThreshold && canCreateLeadGenerations ? (
              <Button
                size="xs"
                className="w-full md:w-fit border border-dynamic-red/30 bg-dynamic-red/10 text-dynamic-red hover:bg-dynamic-red/15"
                title={t('users.guest_leads.create_settings_tooltip')}
              >
                <Settings className="h-4 w-4" />
                {t('users.guest_leads.create_settings')}
              </Button>
            ) : (
              canCreateLeadGenerations ? (
                <Button
                size="xs"
                variant="ghost"
                className="w-full md:w-fit"
                title={t('common.settings')}
              >
                <Settings className="h-4 w-4 mr-1" />
                {t('common.settings')}
              </Button>
              ) : null
            )}
          </DialogTrigger>
          <DialogContent
            onOpenAutoFocus={(e) => e.preventDefault()}
            onWheel={(e) => e.stopPropagation()}
          >
            <DialogHeader>
              <DialogTitle>{t('common.settings')}</DialogTitle>
              <DialogDescription>
                {t('users.guest_lead_threshold.description')}
              </DialogDescription>
            </DialogHeader>
            <GuestLeadSettingsForm
              wsId={wsId}
              data={settingsRow ?? undefined}
              onFinish={() => setOpen(false)}
              canCreateLeadGenerations={canCreateLeadGenerations}
            />
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
