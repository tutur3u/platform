'use client';

import { KeyRound, Plus, Trash2 } from '@tuturuuu/icons';
import type { MobileDeploymentResourceStatus } from '@tuturuuu/internal-api/infrastructure';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { MOBILE_DEPLOYMENT_ENV_KEYS } from './mobile-deployment-config';
import {
  ResourceBadge,
  ResourceMetadata,
} from './mobile-deployment-resource-status';
import {
  MobileDeploymentSecretDialog,
  type SecretDialogState,
} from './mobile-deployment-secret-dialog';

interface EnvRow {
  name: string;
  preset: boolean;
  status?: MobileDeploymentResourceStatus;
}

export function MobileDeploymentEnvPanel({
  clearPending,
  envKeys,
  onClear,
  onSave,
  savePending,
}: {
  clearPending: boolean;
  envKeys: MobileDeploymentResourceStatus[];
  onClear: (name: string) => void;
  onSave: (payload: {
    name: string;
    previousName?: string;
    value: string;
  }) => Promise<void>;
  savePending: boolean;
}) {
  const t = useTranslations('mobile-deployment-settings');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogState, setDialogState] = useState<SecretDialogState | null>(
    null
  );

  const rows = useMemo(() => {
    const presetNames = new Set<string>(MOBILE_DEPLOYMENT_ENV_KEYS);
    const statusByName = new Map(envKeys.map((entry) => [entry.name, entry]));
    const presetRows: EnvRow[] = MOBILE_DEPLOYMENT_ENV_KEYS.map((name) => ({
      name,
      preset: true,
      status: statusByName.get(name),
    }));
    const customRows = envKeys
      .filter((entry) => !presetNames.has(entry.name))
      .map((entry) => ({ name: entry.name, preset: false, status: entry }));

    return [...presetRows, ...customRows];
  }, [envKeys]);

  const openDialog = (row?: EnvRow) => {
    setDialogState({
      description: row ? t('editEnvDescription') : t('addEnvDescription'),
      name: row?.name ?? '',
      nameEditable: !row?.preset,
      previousName: row?.preset ? undefined : row?.name,
      title: row ? t('editEnvKey') : t('addEnvKey'),
    });
    setDialogOpen(true);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">{t('envKeysTitle')}</CardTitle>
        <Button onClick={() => openDialog()} size="sm" variant="outline">
          <Plus className="mr-2 h-4 w-4" />
          {t('addKey')}
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((row) => {
          const configured = Boolean(row.status?.configured);

          return (
            <div
              className="grid gap-3 rounded-md border p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
              data-testid={`mobile-deployment-env-row-${row.name}`}
              key={`${row.preset ? 'preset' : 'custom'}-${row.name}`}
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 truncate font-mono text-sm">
                    {row.name}
                  </span>
                  <ResourceBadge
                    missingLabel={t('missing')}
                    ok={configured}
                    readyLabel={t('ready')}
                  />
                </div>
                <ResourceMetadata status={row.status} />
              </div>

              <div className="flex flex-wrap gap-2 md:justify-end">
                <Button
                  onClick={() => openDialog(row)}
                  size="sm"
                  variant="outline"
                >
                  <KeyRound className="mr-2 h-4 w-4" />
                  {configured ? t('edit') : t('add')}
                </Button>
                <Button
                  disabled={!configured || clearPending}
                  onClick={() => onClear(row.name)}
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
        onSave={onSave}
        open={dialogOpen}
        pending={savePending}
        state={dialogState}
      />
    </Card>
  );
}
