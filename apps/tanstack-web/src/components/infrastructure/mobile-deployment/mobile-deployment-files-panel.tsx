'use client';

import { Upload } from '@tuturuuu/icons';
import type {
  MobileDeploymentFileKind,
  MobileDeploymentState,
} from '@tuturuuu/internal-api/infrastructure/mobile';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { Label } from '@tuturuuu/ui/label';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { MOBILE_DEPLOYMENT_FILE_KINDS } from './mobile-deployment-config';
import { MobileDeploymentFieldHelp } from './mobile-deployment-field-help';
import {
  ResourceBadge,
  ResourceMetadata,
} from './mobile-deployment-resource-status';

export function MobileDeploymentFilesPanel({
  fileArtifacts,
  onUpload,
  uploadPending,
}: {
  fileArtifacts: MobileDeploymentState['fileArtifacts'];
  onUpload: (kind: MobileDeploymentFileKind, file: File) => void;
  uploadPending: boolean;
}) {
  const t = useTranslations('mobile-deployment-settings');
  const fileStatusByName = useMemo(
    () => new Map(fileArtifacts.map((entry) => [entry.name, entry])),
    [fileArtifacts]
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('filesTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {MOBILE_DEPLOYMENT_FILE_KINDS.map((kind) => {
          const status = fileStatusByName.get(kind);
          const configured = Boolean(status?.configured);

          return (
            <div
              className="grid gap-3 rounded-md border p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
              key={kind}
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 truncate font-mono text-sm">
                    {kind}
                  </span>
                  <MobileDeploymentFieldHelp field={kind} />
                  <ResourceBadge
                    missingLabel={t('missing')}
                    ok={configured}
                    readyLabel={t('ready')}
                  />
                </div>
                <ResourceMetadata status={status} />
              </div>
              <Label className="inline-flex cursor-pointer items-center justify-center rounded-md border px-3 py-2 text-sm">
                <Upload className="mr-2 h-4 w-4" />
                {t('upload')}
                <input
                  className="sr-only"
                  disabled={uploadPending}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) {
                      onUpload(kind, file);
                    }
                    event.currentTarget.value = '';
                  }}
                  type="file"
                />
              </Label>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
