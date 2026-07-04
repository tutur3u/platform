'use client';

import { ChevronDown, Loader2, RotateCw, Save } from '@tuturuuu/icons';
import type {
  ExternalAppRegistration,
  SaveExternalAppPayload,
} from '@tuturuuu/internal-api/infrastructure/apps';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@tuturuuu/ui/collapsible';
import { Combobox } from '@tuturuuu/ui/custom/combobox';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Switch } from '@tuturuuu/ui/switch';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

const SCOPE_PRESETS = [
  'workspace:session',
  'workspace:members:read',
  'workspace:members:write',
  'workspace:roles:read',
  'workspace:roles:write',
  'workspace:cron:read',
  'workspace:cron:write',
  'users:profile:read',
  'users:profile:write',
  'external-projects:read',
  'external-projects:publish',
  'external-projects:manage',
  'external-projects:*',
  '*',
];

type ExternalAppDraft = {
  allowedScopes: string[];
  allowedWorkspaceIdsText: string;
  displayName: string;
  enabled: boolean;
  id: string;
  issueSecret: boolean;
  originsText: string;
};

function splitLines(value: string) {
  return value
    .split(/[,\n]/u)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function joinLines(values: string[]) {
  return values.join('\n');
}

function normalizeScopeInput(value: string) {
  const scope = value.trim().toLowerCase();

  return /^[a-z0-9:*._-]{1,80}$/u.test(scope) ? scope : undefined;
}

function normalizeStringList(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b)
  );
}

function buildScopeOptions(scopes: string[]) {
  return [...new Set([...SCOPE_PRESETS, ...scopes])]
    .sort((a, b) => a.localeCompare(b))
    .map((scope) => ({
      label: scope,
      value: scope,
    }));
}

function draftFromApp(app?: ExternalAppRegistration): ExternalAppDraft {
  return {
    allowedScopes: app?.allowedScopes ?? [],
    allowedWorkspaceIdsText: app ? joinLines(app.allowedWorkspaceIds) : '',
    displayName: app?.displayName ?? '',
    enabled: app?.enabled ?? true,
    id: app?.id ?? '',
    issueSecret: !app,
    originsText: app ? joinLines(app.origins) : '',
  };
}

function serializeDraft(draft: ExternalAppDraft, includeIssueSecret: boolean) {
  return JSON.stringify({
    allowedScopes: normalizeStringList(draft.allowedScopes),
    allowedWorkspaceIds: normalizeStringList(
      splitLines(draft.allowedWorkspaceIdsText)
    ),
    displayName: draft.displayName.trim(),
    enabled: draft.enabled,
    id: draft.id.trim().toLowerCase(),
    issueSecret: includeIssueSecret ? draft.issueSecret : false,
    origins: normalizeStringList(splitLines(draft.originsText)),
  });
}

function payloadFromDraft(
  draft: ExternalAppDraft,
  isCreate: boolean,
  appId?: string
): SaveExternalAppPayload {
  return {
    allowedScopes: splitLines(draft.allowedScopes.join('\n')),
    allowedWorkspaceIds: splitLines(draft.allowedWorkspaceIdsText),
    displayName: draft.displayName.trim(),
    enabled: draft.enabled,
    id: appId ?? draft.id.trim().toLowerCase(),
    issueSecret: isCreate ? draft.issueSecret : false,
    origins: splitLines(draft.originsText),
  };
}

export function appRenderKey(app: ExternalAppRegistration) {
  return [
    app.id,
    app.updatedAt ?? '',
    app.displayName,
    app.enabled ? '1' : '0',
    app.origins.join('\n'),
    app.allowedScopes.join('\n'),
    app.allowedWorkspaceIds.join('\n'),
    app.secretLastFour ?? '',
  ].join('|');
}

export function ExternalAppForm({
  app,
  isPending,
  onSubmit,
}: {
  app?: ExternalAppRegistration;
  isPending: boolean;
  onSubmit: (payload: SaveExternalAppPayload) => void;
}) {
  const t = useTranslations('external-apps-settings');
  const isCreate = !app;
  const [draft, setDraft] = useState(() => draftFromApp(app));
  const baseline = useMemo(
    () => serializeDraft(draftFromApp(app), isCreate),
    [app, isCreate]
  );
  const current = serializeDraft(draft, isCreate);
  const isDirty = isCreate || current !== baseline;
  const scopeOptions = useMemo(
    () => buildScopeOptions(draft.allowedScopes),
    [draft.allowedScopes]
  );
  const formId = app ? app.id : 'new';

  function updateDraft(patch: Partial<ExternalAppDraft>) {
    setDraft((currentDraft) => ({ ...currentDraft, ...patch }));
  }

  return (
    <form
      className="space-y-4 rounded-lg border border-border bg-card p-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(payloadFromDraft(draft, isCreate, app?.id));
        if (isCreate) {
          setDraft(draftFromApp());
        }
      }}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${formId}-displayName`}>
            {t('fields.display_name')}
          </Label>
          <Input
            id={`${formId}-displayName`}
            name="displayName"
            required
            value={draft.displayName}
            onChange={(event) =>
              updateDraft({ displayName: event.target.value })
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${formId}-id`}>{t('fields.app_id')}</Label>
          <Input
            disabled={!isCreate}
            id={`${formId}-id`}
            name="id"
            pattern="[a-z0-9_-]{1,64}"
            required
            value={draft.id}
            onChange={(event) =>
              updateDraft({ id: event.target.value.toLowerCase() })
            }
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`${formId}-origins`}>{t('fields.origins')}</Label>
          <Textarea
            id={`${formId}-origins`}
            name="origins"
            placeholder="https://yoola.ai.vn"
            required
            rows={3}
            value={draft.originsText}
            onChange={(event) =>
              updateDraft({ originsText: event.target.value })
            }
          />
        </div>
        <div className="space-y-2">
          <Label>{t('fields.scopes')}</Label>
          <Combobox
            className="w-full"
            contentWidth="lg"
            createText={t('fields.scopes_create')}
            emptyText={t('fields.scopes_empty')}
            mode="multiple"
            onChange={(value) =>
              updateDraft({
                allowedScopes: (Array.isArray(value) ? value : [value]).filter(
                  Boolean
                ),
              })
            }
            onCreate={normalizeScopeInput}
            options={scopeOptions}
            placeholder={t('fields.scopes_placeholder')}
            searchPlaceholder={t('fields.scopes_search')}
            selected={draft.allowedScopes}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${formId}-workspaces`}>
            {t('fields.workspace_ids')}
          </Label>
          <Textarea
            id={`${formId}-workspaces`}
            name="allowedWorkspaceIds"
            placeholder="workspace-id"
            rows={3}
            value={draft.allowedWorkspaceIdsText}
            onChange={(event) =>
              updateDraft({ allowedWorkspaceIdsText: event.target.value })
            }
          />
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Switch
            checked={draft.enabled}
            id={`${formId}-enabled`}
            name="enabled"
            onCheckedChange={(enabled) => updateDraft({ enabled })}
          />
          <Label htmlFor={`${formId}-enabled`}>{t('fields.enabled')}</Label>
        </div>
        {isCreate ? (
          <div className="flex items-center gap-3">
            <Switch
              checked={draft.issueSecret}
              id="new-issueSecret"
              name="issueSecret"
              onCheckedChange={(issueSecret) => updateDraft({ issueSecret })}
            />
            <Label htmlFor="new-issueSecret">{t('fields.issue_secret')}</Label>
          </div>
        ) : null}
        <Button disabled={isPending || !isDirty} type="submit">
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

export function ExternalAppCard({
  app,
  isPending,
  onRotate,
  onSubmit,
}: {
  app: ExternalAppRegistration;
  isPending: boolean;
  onRotate: (appId: string) => void;
  onSubmit: (payload: SaveExternalAppPayload) => void;
}) {
  const t = useTranslations('external-apps-settings');
  const [open, setOpen] = useState(false);

  return (
    <Collapsible
      className="rounded-lg border border-border bg-background p-4"
      data-testid={`external-app-card-${app.id}`}
      open={open}
      onOpenChange={setOpen}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <CollapsibleTrigger asChild>
              <Button
                aria-label={t(open ? 'actions.collapse' : 'actions.expand', {
                  app: app.displayName,
                })}
                size="icon"
                type="button"
                variant="ghost"
              >
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${
                    open ? 'rotate-180' : ''
                  }`}
                />
              </Button>
            </CollapsibleTrigger>
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

      <div className="mt-4 grid gap-3 text-sm md:grid-cols-4">
        <div>
          <div className="text-muted-foreground">{t('summary.origins')}</div>
          <div className="font-medium">{app.origins.length}</div>
        </div>
        <div>
          <div className="text-muted-foreground">{t('summary.scopes')}</div>
          <div className="font-medium">{app.allowedScopes.length}</div>
        </div>
        <div>
          <div className="text-muted-foreground">{t('summary.workspaces')}</div>
          <div className="font-medium">{app.allowedWorkspaceIds.length}</div>
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

      <CollapsibleContent className="mt-4">
        <ExternalAppForm app={app} isPending={isPending} onSubmit={onSubmit} />
      </CollapsibleContent>
    </Collapsible>
  );
}
