'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, KeyRound } from '@tuturuuu/icons';
import {
  type ExternalAppRegistration,
  listExternalApps,
  rotateExternalAppSecret,
  type SaveExternalAppPayload,
  saveExternalApp,
} from '@tuturuuu/internal-api/infrastructure/apps';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  appRenderKey,
  ExternalAppCard,
  ExternalAppForm,
} from './external-apps-client-components';

const QUERY_KEY = ['infrastructure', 'external-apps'];

type OneTimeSecret = {
  appId: string;
  value: string;
} | null;

function SecretPanel({
  secret,
  setSecret,
}: {
  secret: OneTimeSecret;
  setSecret: (secret: OneTimeSecret) => void;
}) {
  const t = useTranslations('external-apps-settings');

  if (!secret) {
    return null;
  }

  return (
    <div className="space-y-3 rounded-lg border border-dynamic-yellow/30 bg-dynamic-yellow/10 p-4">
      <div>
        <h2 className="font-semibold text-base">{t('secret.title')}</h2>
        <p className="text-muted-foreground text-sm">
          {t('secret.description', { appId: secret.appId })}
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          aria-label={t('secret.value_label')}
          className="font-mono text-sm"
          readOnly
          value={secret.value}
        />
        <Button
          type="button"
          variant="secondary"
          onClick={async () => {
            await navigator.clipboard.writeText(secret.value);
            toast.success(t('secret.copy_success'));
          }}
        >
          <Copy className="h-4 w-4" />
          {t('secret.copy')}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setSecret(null)}>
          {t('secret.dismiss')}
        </Button>
      </div>
    </div>
  );
}

export function ExternalAppsClient({
  initialApps,
}: {
  initialApps: ExternalAppRegistration[];
}) {
  const t = useTranslations('external-apps-settings');
  const queryClient = useQueryClient();
  const [secret, setSecret] = useState<OneTimeSecret>(null);
  const { data } = useQuery({
    initialData: { apps: initialApps },
    queryFn: () => listExternalApps(),
    queryKey: QUERY_KEY,
  });
  const saveMutation = useMutation({
    mutationFn: (payload: SaveExternalAppPayload) => saveExternalApp(payload),
    onError: (error) => toast.error(error.message || t('messages.save_error')),
    onSuccess: (result) => {
      if (result.secret) {
        setSecret({ appId: result.app.id, value: result.secret });
      }
      toast.success(t('messages.save_success'));
      queryClient.setQueryData(
        QUERY_KEY,
        (current: { apps: ExternalAppRegistration[] } | undefined) => ({
          apps: [
            result.app,
            ...(current?.apps ?? []).filter((app) => app.id !== result.app.id),
          ].sort((a, b) => a.id.localeCompare(b.id)),
        })
      );
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
  const rotateMutation = useMutation({
    mutationFn: (appId: string) => rotateExternalAppSecret(appId),
    onError: (error) =>
      toast.error(error.message || t('messages.rotate_error')),
    onSuccess: (result) => {
      if (result.secret) {
        setSecret({ appId: result.app.id, value: result.secret });
      }
      toast.success(t('messages.rotate_success'));
      void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
  const submitApp = (payload: SaveExternalAppPayload) => {
    saveMutation.mutate(payload);
  };

  return (
    <div className="space-y-6">
      <SecretPanel secret={secret} setSecret={setSecret} />

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-primary" />
          <h2 className="font-semibold text-lg">{t('new_app.title')}</h2>
        </div>
        <ExternalAppForm
          isPending={saveMutation.isPending}
          onSubmit={submitApp}
        />
      </div>

      <div className="space-y-3">
        <h2 className="font-semibold text-lg">{t('registered.title')}</h2>
        {data.apps.length === 0 ? (
          <div className="rounded-lg border border-border border-dashed p-8 text-center text-muted-foreground">
            {t('registered.empty')}
          </div>
        ) : (
          <div className="space-y-4">
            {data.apps.map((app) => (
              <ExternalAppCard
                app={app}
                isPending={saveMutation.isPending || rotateMutation.isPending}
                key={appRenderKey(app)}
                onRotate={(appId) => rotateMutation.mutate(appId)}
                onSubmit={submitApp}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
