'use client';

import { Plus, Search } from '@tuturuuu/icons';
import type {
  MobileDeploymentResourceStatus,
  MobileDeploymentScalarName,
} from '@tuturuuu/internal-api/infrastructure';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  MOBILE_DEPLOYMENT_ENV_KEYS,
  MOBILE_DEPLOYMENT_SCALAR_NAMES,
} from './mobile-deployment-config';
import {
  MobileDeploymentSecretDialog,
  type SecretDialogState,
} from './mobile-deployment-secret-dialog';
import {
  type MobileDeploymentSecretKind,
  MobileDeploymentSecretRow,
  type MobileDeploymentSecretRowModel,
} from './mobile-deployment-secret-row';

type SecretDialogContext = SecretDialogState & {
  kind: MobileDeploymentSecretKind;
};

export function MobileDeploymentSecretsPanel({
  clearPending,
  envKeys,
  onClearEnv,
  onClearScalar,
  onSaveEnv,
  onSaveScalar,
  savePending,
  scalarValues,
}: {
  clearPending: boolean;
  envKeys: MobileDeploymentResourceStatus[];
  onClearEnv: (name: string) => void;
  onClearScalar: (name: MobileDeploymentScalarName) => void;
  onSaveEnv: (payload: {
    name: string;
    previousName?: string;
    value: string;
  }) => Promise<void>;
  onSaveScalar: (payload: {
    name: MobileDeploymentScalarName;
    value: string;
  }) => Promise<void>;
  savePending: boolean;
  scalarValues: MobileDeploymentResourceStatus[];
}) {
  const t = useTranslations('mobile-deployment-settings');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogState, setDialogState] = useState<SecretDialogContext | null>(
    null
  );
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    const envPresetNames = new Set<string>(MOBILE_DEPLOYMENT_ENV_KEYS);
    const envStatusByName = new Map(
      envKeys.map((entry) => [entry.name, entry])
    );
    const scalarStatusByName = new Map(
      scalarValues.map((entry) => [entry.name, entry])
    );

    const scalarRows: MobileDeploymentSecretRowModel[] =
      MOBILE_DEPLOYMENT_SCALAR_NAMES.map((name) => ({
        kind: 'scalar',
        name,
        nameEditable: false,
        preset: true,
        status: scalarStatusByName.get(name),
      }));
    const envPresetRows: MobileDeploymentSecretRowModel[] =
      MOBILE_DEPLOYMENT_ENV_KEYS.map((name) => ({
        kind: 'env',
        name,
        nameEditable: false,
        preset: true,
        status: envStatusByName.get(name),
      }));
    const customRows: MobileDeploymentSecretRowModel[] = envKeys
      .filter((entry) => !envPresetNames.has(entry.name))
      .map((entry) => ({
        kind: 'env',
        name: entry.name,
        nameEditable: true,
        preset: false,
        status: entry,
      }));

    return [...scalarRows, ...envPresetRows, ...customRows];
  }, [envKeys, scalarValues]);

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toUpperCase();

    if (!normalizedQuery) {
      return rows;
    }

    return rows.filter((row) => row.name.includes(normalizedQuery));
  }, [query, rows]);

  const configuredCount = rows.filter((row) => row.status?.configured).length;

  const openDialog = (row?: MobileDeploymentSecretRowModel) => {
    setDialogState({
      description: row ? t('editSecretDescription') : t('addSecretDescription'),
      kind: row?.kind ?? 'env',
      name: row?.name ?? '',
      nameEditable: row?.nameEditable ?? true,
      previousName:
        row?.kind === 'env' && row.nameEditable ? row.name : undefined,
      title: row ? t('editSecret') : t('addSecret'),
    });
    setDialogOpen(true);
  };

  const saveSecret = async ({
    name,
    previousName,
    value,
  }: {
    name: string;
    previousName?: string;
    value: string;
  }) => {
    if (dialogState?.kind === 'scalar') {
      await onSaveScalar({
        name: name as MobileDeploymentScalarName,
        value,
      });
      return;
    }

    await onSaveEnv({ name, previousName, value });
  };

  const clearSecret = (row: MobileDeploymentSecretRowModel) => {
    if (row.kind === 'scalar') {
      onClearScalar(row.name as MobileDeploymentScalarName);
      return;
    }

    onClearEnv(row.name);
  };

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <CardTitle className="text-base">{t('secretsTitle')}</CardTitle>
          <div className="text-muted-foreground text-sm">
            {t('configuredSecrets', {
              configured: configuredCount,
              total: rows.length,
            })}
          </div>
        </div>
        <Button onClick={() => openDialog()} size="sm" variant="outline">
          <Plus className="mr-2 h-4 w-4" />
          {t('addSecret')}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Label className="sr-only" htmlFor="mobile-deployment-secret-search">
            {t('searchSecrets')}
          </Label>
          <div className="relative">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              id="mobile-deployment-secret-search"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('searchSecrets')}
              value={query}
            />
          </div>
        </div>

        <div className="space-y-2">
          {filteredRows.map((row) => (
            <MobileDeploymentSecretRow
              clearPending={clearPending}
              key={`${row.kind}-${row.name}`}
              onClear={clearSecret}
              onEdit={openDialog}
              row={row}
            />
          ))}
        </div>
      </CardContent>

      <MobileDeploymentSecretDialog
        onOpenChange={setDialogOpen}
        onSave={saveSecret}
        open={dialogOpen}
        pending={savePending}
        state={dialogState}
      />
    </Card>
  );
}
