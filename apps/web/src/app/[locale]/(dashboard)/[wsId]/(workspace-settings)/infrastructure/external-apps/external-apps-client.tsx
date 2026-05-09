'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, KeyRound, Loader2, RotateCw, Save } from '@tuturuuu/icons';
import {
  type ExternalAppRegistration,
  listExternalApps,
  rotateExternalAppSecret,
  type SaveExternalAppPayload,
  saveExternalApp,
} from '@tuturuuu/internal-api/infrastructure';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

const QUERY_KEY = ['infrastructure', 'external-apps'];

type OneTimeSecret = {
  appId: string;
  value: string;
} | null;

function splitLines(value: FormDataEntryValue | null) {
  return String(value ?? '')
    .split(/[,\n]/u)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function joinLines(values: string[]) {
  return values.join('\n');
}

function readFormPayload(formData: FormData, appId?: string) {
  return {
    allowedScopes: splitLines(formData.get('allowedScopes')),
    displayName: String(formData.get('displayName') ?? '').trim(),
    enabled: formData.get('enabled') === 'on',
    id:
      appId ??
      String(formData.get('id') ?? '')
        .trim()
        .toLowerCase(),
    issueSecret: formData.get('issueSecret') === 'on',
    origins: splitLines(formData.get('origins')),
  };
}

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

function ExternalAppForm({
  app,
  isPending,
  onSubmit,
}: {
  app?: ExternalAppRegistration;
  isPending: boolean;
  onSubmit: (formData: FormData, appId?: string) => void;
}) {
  const t = useTranslations('external-apps-settings');
  const isCreate = !app;

  return (
    <form
      className="space-y-4 rounded-lg border border-border bg-card p-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(new FormData(event.currentTarget), app?.id);
        if (isCreate) {
          event.currentTarget.reset();
        }
      }}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={app ? `${app.id}-displayName` : 'new-displayName'}>
            {t('fields.display_name')}
          </Label>
          <Input
            defaultValue={app?.displayName}
            id={app ? `${app.id}-displayName` : 'new-displayName'}
            name="displayName"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={app ? `${app.id}-id` : 'new-id'}>
            {t('fields.app_id')}
          </Label>
          <Input
            defaultValue={app?.id}
            disabled={!isCreate}
            id={app ? `${app.id}-id` : 'new-id'}
            name="id"
            pattern="[a-z0-9_-]{1,64}"
            required
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={app ? `${app.id}-origins` : 'new-origins'}>
            {t('fields.origins')}
          </Label>
          <Textarea
            defaultValue={app ? joinLines(app.origins) : ''}
            id={app ? `${app.id}-origins` : 'new-origins'}
            name="origins"
            placeholder="https://yoola.ai.vn"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={app ? `${app.id}-scopes` : 'new-scopes'}>
            {t('fields.scopes')}
          </Label>
          <Textarea
            defaultValue={
              app ? joinLines(app.allowedScopes) : 'external-projects:*'
            }
            id={app ? `${app.id}-scopes` : 'new-scopes'}
            name="allowedScopes"
            required
          />
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Switch
            defaultChecked={app?.enabled ?? true}
            id={app ? `${app.id}-enabled` : 'new-enabled'}
            name="enabled"
          />
          <Label htmlFor={app ? `${app.id}-enabled` : 'new-enabled'}>
            {t('fields.enabled')}
          </Label>
        </div>
        {isCreate ? (
          <div className="flex items-center gap-3">
            <Switch defaultChecked id="new-issueSecret" name="issueSecret" />
            <Label htmlFor="new-issueSecret">{t('fields.issue_secret')}</Label>
          </div>
        ) : null}
        <Button disabled={isPending} type="submit">
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {isCreate ? t('actions.create') : t('actions.save')}
        </Button>
      </div>
    </form>
  );
}

function ExternalAppCard({
  app,
  isPending,
  onRotate,
  onSubmit,
}: {
  app: ExternalAppRegistration;
  isPending: boolean;
  onRotate: (appId: string) => void;
  onSubmit: (formData: FormData, appId?: string) => void;
}) {
  const t = useTranslations('external-apps-settings');

  return (
    <div className="space-y-4 rounded-lg border border-border bg-background p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold text-lg">{app.displayName}</h2>
            <Badge variant={app.enabled ? 'success' : 'secondary'}>
              {app.enabled ? t('status.enabled') : t('status.disabled')}
            </Badge>
          </div>
          <p className="font-mono text-muted-foreground text-sm">{app.id}</p>
        </div>
        <Button
          disabled={isPending}
          onClick={() => onRotate(app.id)}
          type="button"
          variant="secondary"
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RotateCw className="h-4 w-4" />
          )}
          {t('actions.rotate_secret')}
        </Button>
      </div>

      <div className="grid gap-3 text-sm md:grid-cols-3">
        <div>
          <div className="text-muted-foreground">{t('summary.origins')}</div>
          <div className="font-medium">{app.origins.length}</div>
        </div>
        <div>
          <div className="text-muted-foreground">{t('summary.scopes')}</div>
          <div className="font-medium">{app.allowedScopes.length}</div>
        </div>
        <div>
          <div className="text-muted-foreground">
            {t('summary.last_secret')}
          </div>
          <div className="font-medium">
            {app.secretLastFour
              ? t('summary.secret_suffix', { suffix: app.secretLastFour })
              : t('summary.no_secret')}
          </div>
        </div>
      </div>

      <ExternalAppForm app={app} isPending={isPending} onSubmit={onSubmit} />
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
  const submitApp = (formData: FormData, appId?: string) => {
    saveMutation.mutate(readFormPayload(formData, appId));
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
                key={app.id}
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
