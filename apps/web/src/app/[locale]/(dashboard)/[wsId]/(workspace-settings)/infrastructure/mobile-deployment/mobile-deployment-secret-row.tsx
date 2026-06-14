'use client';

import { KeyRound, Trash2 } from '@tuturuuu/icons';
import type { MobileDeploymentResourceStatus } from '@tuturuuu/internal-api/infrastructure';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import {
  ResourceBadge,
  ResourceMetadata,
} from './mobile-deployment-resource-status';

export type MobileDeploymentSecretKind = 'env' | 'scalar';

export interface MobileDeploymentSecretRowModel {
  kind: MobileDeploymentSecretKind;
  name: string;
  nameEditable: boolean;
  preset: boolean;
  status?: MobileDeploymentResourceStatus;
}

export function MobileDeploymentSecretRow({
  clearPending,
  onClear,
  onEdit,
  row,
}: {
  clearPending: boolean;
  onClear: (row: MobileDeploymentSecretRowModel) => void;
  onEdit: (row: MobileDeploymentSecretRowModel) => void;
  row: MobileDeploymentSecretRowModel;
}) {
  const t = useTranslations('mobile-deployment-settings');
  const configured = Boolean(row.status?.configured);

  return (
    <div
      className="grid gap-3 rounded-md border p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
      data-testid={`mobile-deployment-secret-row-${row.name}`}
    >
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 truncate font-mono text-sm">{row.name}</span>
          <ResourceBadge
            missingLabel={t('missing')}
            ok={configured}
            readyLabel={t('ready')}
          />
          <Badge variant="outline">
            {row.preset ? t('preset') : t('custom')}
          </Badge>
        </div>
        <ResourceMetadata status={row.status} />
      </div>

      <div className="flex flex-wrap gap-2 md:justify-end">
        <Button onClick={() => onEdit(row)} size="sm" variant="outline">
          <KeyRound className="mr-2 h-4 w-4" />
          {configured ? t('edit') : t('add')}
        </Button>
        <Button
          disabled={!configured || clearPending}
          onClick={() => onClear(row)}
          size="sm"
          variant="ghost"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          {t('clear')}
        </Button>
      </div>
    </div>
  );
}
