'use client';

import { Plus, Search } from '@tuturuuu/icons';
import type {
  MobileDeploymentResourceStatus,
  MobileDeploymentScalarName,
} from '@tuturuuu/internal-api/infrastructure/mobile';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  MOBILE_DEPLOYMENT_FIELD_OPTIONS,
  MOBILE_DEPLOYMENT_NON_SECRET_NAMES,
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
import {
  buildMobileDeploymentSecretRows,
  filterMobileDeploymentSecretRows,
} from './mobile-deployment-secret-rows';

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
    return buildMobileDeploymentSecretRows({ envKeys, scalarValues });
  }, [envKeys, scalarValues]);

  const filteredRows = useMemo(() => {
    return filterMobileDeploymentSecretRows({ query, rows });
  }, [query, rows]);

  const configuredCount = rows.filter((row) => row.status?.configured).length;

  const openDialog = (row?: MobileDeploymentSecretRowModel) => {
    const fieldName = row?.name ?? '';
    setDialogState({
      currentValue: row?.status?.value ?? undefined,
      description: row ? t('editSecretDescription') : t('addSecretDescription'),
      kind: row?.kind ?? 'env',
      name: fieldName,
      nameEditable: row?.nameEditable ?? true,
      options: fieldName
        ? MOBILE_DEPLOYMENT_FIELD_OPTIONS[fieldName]
        : undefined,
      previousName:
        row?.kind === 'env' && row.nameEditable ? row.name : undefined,
      secret: fieldName
        ? !MOBILE_DEPLOYMENT_NON_SECRET_NAMES.has(fieldName)
        : true,
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
