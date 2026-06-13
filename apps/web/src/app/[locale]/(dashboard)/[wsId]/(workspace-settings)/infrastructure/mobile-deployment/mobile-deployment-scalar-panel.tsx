'use client';

import { KeyRound, Trash2 } from '@tuturuuu/icons';
import type {
  MobileDeploymentResourceStatus,
  MobileDeploymentScalarName,
} from '@tuturuuu/internal-api/infrastructure';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { MOBILE_DEPLOYMENT_SCALAR_NAMES } from './mobile-deployment-config';
import {
  ResourceBadge,
  ResourceMetadata,
} from './mobile-deployment-resource-status';
import {
  MobileDeploymentSecretDialog,
  type SecretDialogState,
} from './mobile-deployment-secret-dialog';

export function MobileDeploymentScalarPanel({
  clearPending,
  onClear,
  onSave,
  savePending,
  scalarValues,
}: {
  clearPending: boolean;
  onClear: (name: MobileDeploymentScalarName) => void;
  onSave: (payload: {
    name: MobileDeploymentScalarName;
    value: string;
  }) => Promise<void>;
  savePending: boolean;
  scalarValues: MobileDeploymentResourceStatus[];
}) {
  const t = useTranslations('mobile-deployment-settings');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogState, setDialogState] = useState<SecretDialogState | null>(
    null
  );

  const statusByName = useMemo(
    () => new Map(scalarValues.map((entry) => [entry.name, entry])),
    [scalarValues]
  );

  const openDialog = (name: MobileDeploymentScalarName) => {
    setDialogState({
      description: t('editScalarDescription'),
      name,
      nameEditable: false,
      title: t('editScalarKey'),
    });
    setDialogOpen(true);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('scalarsTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {MOBILE_DEPLOYMENT_SCALAR_NAMES.map((name) => {
          const status = statusByName.get(name);
          const configured = Boolean(status?.configured);

          return (
            <div
              className="grid gap-3 rounded-md border p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
              data-testid={`mobile-deployment-scalar-row-${name}`}
              key={name}
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 truncate font-mono text-sm">
                    {name}
                  </span>
                  <ResourceBadge
                    missingLabel={t('missing')}
                    ok={configured}
                    readyLabel={t('ready')}
                  />
                </div>
                <ResourceMetadata status={status} />
              </div>

              <div className="flex flex-wrap gap-2 md:justify-end">
                <Button
                  onClick={() => openDialog(name)}
                  size="sm"
                  variant="outline"
                >
                  <KeyRound className="mr-2 h-4 w-4" />
                  {configured ? t('edit') : t('add')}
                </Button>
                <Button
                  disabled={!configured || clearPending}
                  onClick={() => onClear(name)}
                  size="sm"
                  variant="ghost"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {t('clear')}
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>

      <MobileDeploymentSecretDialog
        onOpenChange={setDialogOpen}
        onSave={({ name, value }) =>
          onSave({ name: name as MobileDeploymentScalarName, value })
        }
        open={dialogOpen}
        pending={savePending}
        state={dialogState}
      />
    </Card>
  );
}
