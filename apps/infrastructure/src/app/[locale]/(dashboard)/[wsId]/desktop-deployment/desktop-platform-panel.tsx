'use client';

import type {
  DesktopVaultMutation,
  DesktopVaultPlatform,
  DesktopVaultVersion,
} from '@tuturuuu/internal-api/infrastructure';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@tuturuuu/ui/card';
import { useTranslations } from 'next-intl';
import { DESKTOP_SIGNING_PROFILES } from '@/lib/desktop-deployment/contract';
import { DesktopResourceField } from './desktop-resource-field';
export function DesktopPlatformPanel({
  platform,
  versions,
  pending,
  act,
  upload,
}: {
  platform: DesktopVaultPlatform;
  versions: DesktopVaultVersion[];
  pending: boolean;
  act: (input: DesktopVaultMutation) => Promise<void>;
  upload: (
    version: DesktopVaultVersion,
    name: string,
    file: File
  ) => Promise<void>;
}) {
  const t = useTranslations('desktop-deployment');
  const draft = versions.find(
    (version) => version.platform === platform && version.status === 'draft'
  );
  const active = versions.find(
    (version) => version.platform === platform && version.status === 'active'
  );
  const ready =
    draft &&
    draft.validatedRevision === draft.revision &&
    !draft.validationErrors.length;
  const profile = DESKTOP_SIGNING_PROFILES[platform];
  const files: readonly string[] = profile.files;
  return (
    <Card role="region" aria-label={t(`platforms.${platform}`)}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center justify-between gap-2">
          {t(`platforms.${platform}`)}
          <Badge variant="secondary">{t('vault.deliveryDisabled')}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-muted-foreground text-sm">
          {active
            ? t('vault.activeVersion', { version: active.version })
            : t('vault.noActiveVersion')}
        </p>
        {!draft ? (
          <Button
            disabled={pending}
            onClick={() => {
              void act({ action: 'create_version', platform }).catch(() => {});
            }}
          >
            {t('vault.createDraft')}
          </Button>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-medium">
                {t('vault.draftVersion', {
                  version: draft.version,
                  revision: draft.revision,
                })}
              </h3>
              <Badge variant={ready ? 'default' : 'outline'}>
                {t(ready ? 'vault.materialReady' : 'vault.notValidated')}
              </Badge>
            </div>
            <p className="text-muted-foreground text-sm">
              {t('vault.noReadback')}
            </p>
            {[...profile.files, ...profile.scalars].map((name) => (
              <DesktopResourceField
                key={`${draft.id}:${name}`}
                name={name}
                file={files.includes(name)}
                configured={draft.resources.includes(name)}
                pending={pending}
                save={(value) =>
                  typeof value === 'string'
                    ? act({
                        action: 'save_scalar',
                        versionId: draft.id,
                        revision: draft.revision,
                        name,
                        value,
                      })
                    : upload(draft, name, value)
                }
                remove={() =>
                  act({
                    action: 'remove_resource',
                    versionId: draft.id,
                    revision: draft.revision,
                    name,
                  })
                }
              />
            ))}
            {!!draft.validationErrors.length && (
              <ul
                className="space-y-1 text-muted-foreground text-sm"
                aria-label={t('vault.validationResults')}
              >
                {draft.validationErrors.map((error) => (
                  <li key={error}>
                    {t.has(`vault.errors.${error}`)
                      ? t(`vault.errors.${error}`)
                      : t('vault.validationFailed')}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => {
                  void act({
                    action: 'validate',
                    versionId: draft.id,
                    revision: draft.revision,
                  }).catch(() => {});
                }}
              >
                {t('vault.validate')}
              </Button>
              <Button
                disabled={pending || !ready}
                onClick={() => {
                  void act({
                    action: 'activate',
                    versionId: draft.id,
                    revision: draft.revision,
                  }).catch(() => {});
                }}
              >
                {t('vault.activate')}
              </Button>
            </div>
          </>
        )}
        <p className="text-muted-foreground text-xs">
          {t('vault.portableOnly')}
        </p>
      </CardContent>
    </Card>
  );
}
