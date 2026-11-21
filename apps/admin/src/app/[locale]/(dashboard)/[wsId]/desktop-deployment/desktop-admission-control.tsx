'use client';

import type {
  DesktopVaultMutation,
  DesktopVaultPlatform,
  DesktopVaultState,
  DesktopVaultVersion,
} from '@tuturuuu/internal-api/infrastructure';
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
import { useState } from 'react';

export function DesktopAdmissionControl({
  platform,
  environment,
  active,
  pending,
  act,
}: {
  platform: DesktopVaultPlatform;
  environment?: DesktopVaultState['platforms'][number];
  active?: DesktopVaultVersion;
  pending: boolean;
  act: (input: DesktopVaultMutation) => Promise<void>;
}) {
  const t = useTranslations('desktop-deployment.vault');
  const [confirm, setConfirm] = useState(false);
  const revision = environment?.revision;
  const hasRevision =
    typeof revision === 'number' &&
    Number.isSafeInteger(revision) &&
    revision >= 0;
  const ready =
    active?.platform === platform &&
    active.status === 'active' &&
    active.id === environment?.activeVersionId &&
    active.validatedRevision === active.revision &&
    !active.validationErrors.length;
  const canEnable = hasRevision && ready && !pending;
  return (
    <div className="space-y-2 border-t pt-3">
      <p className="text-muted-foreground text-sm">{t('admissionScope')}</p>
      {!hasRevision && <p role="status">{t('admissionRevisionUnavailable')}</p>}
      {environment?.enabled ? (
        <Button
          variant="outline"
          disabled={pending || !hasRevision}
          onClick={() => {
            if (!hasRevision || pending) return;
            void act({
              action: 'disable_delivery',
              platform,
              environmentRevision: revision,
            }).catch(() => {});
          }}
        >
          {t('disableDelivery')}
        </Button>
      ) : (
        <>
          <Button disabled={!canEnable} onClick={() => setConfirm(true)}>
            {t('enableDelivery')}
          </Button>
          <Dialog open={confirm} onOpenChange={setConfirm}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{t('enableDelivery')}</DialogTitle>
                <DialogDescription>
                  {t('enableDeliveryConfirm')}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirm(false)}>
                  {t('cancelAdmission')}
                </Button>
                <Button
                  disabled={!canEnable}
                  onClick={() => {
                    if (!canEnable || !active) return;
                    setConfirm(false);
                    void act({
                      action: 'enable_delivery',
                      platform,
                      environmentRevision: revision,
                      versionId: active.id,
                      revision: active.revision,
                    }).catch(() => {});
                  }}
                >
                  {t('confirmEnableDelivery')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
