'use client';

import { Save, Search, Settings, ShieldCheck } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';
import { useMemo, useState, useTransition } from 'react';
import {
  updateGlobalAiStudioSettingsAction,
  updateWorkspaceAiStudioPolicyAction,
} from './actions';
import type {
  AiStudioGlobalSettings,
  AiStudioPolicyState,
  AiStudioWorkspacePolicy,
} from './types';

function parseModels(value: string) {
  return [
    ...new Set(
      value
        .split(',')
        .map((model) => model.trim())
        .filter(Boolean)
    ),
  ];
}

function optionalNumber(value: string) {
  if (!value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function AiStudioPolicyClient({
  globalSettings: initialGlobalSettings,
  infrastructureWsId,
  workspacePolicies: initialWorkspacePolicies,
}: {
  globalSettings: AiStudioGlobalSettings;
  infrastructureWsId: string;
  workspacePolicies: AiStudioWorkspacePolicy[];
}) {
  const t = useTranslations('ai-studio-admin');
  const [globalSettings, setGlobalSettings] = useState(initialGlobalSettings);
  const [workspacePolicies, setWorkspacePolicies] = useState(
    initialWorkspacePolicies
  );
  const [query, setQuery] = useState('');
  const [isPending, startTransition] = useTransition();

  const filteredPolicies = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return workspacePolicies;
    return workspacePolicies.filter(
      (policy) =>
        policy.workspaceName.toLocaleLowerCase().includes(normalizedQuery) ||
        policy.wsId.toLocaleLowerCase().includes(normalizedQuery)
    );
  }, [query, workspacePolicies]);

  function saveGlobalSettings() {
    startTransition(async () => {
      try {
        await updateGlobalAiStudioSettingsAction(
          infrastructureWsId,
          globalSettings
        );
        toast.success(t('saved'));
      } catch (error) {
        console.error(error);
        toast.error(t('save_error'));
      }
    });
  }

  function updateWorkspacePolicy(
    wsId: string,
    patch: Partial<AiStudioWorkspacePolicy>
  ) {
    setWorkspacePolicies((current) =>
      current.map((policy) =>
        policy.wsId === wsId ? { ...policy, ...patch } : policy
      )
    );
  }

  function saveWorkspacePolicy(policy: AiStudioWorkspacePolicy) {
    startTransition(async () => {
      try {
        await updateWorkspaceAiStudioPolicyAction(infrastructureWsId, policy);
        toast.success(t('saved'));
      } catch (error) {
        console.error(error);
        toast.error(t('save_error'));
      }
    });
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border bg-card">
        <div className="flex flex-col gap-3 border-b p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 font-semibold">
              <Settings className="h-4 w-4 text-primary" />
              {t('global.title')}
            </div>
            <p className="mt-1 text-muted-foreground text-sm">
              {t('global.description')}
            </p>
          </div>
          <Badge
            variant={globalSettings.globallyEnabled ? 'default' : 'secondary'}
          >
            {globalSettings.globallyEnabled
              ? t('status.enabled')
              : t('status.disabled')}
          </Badge>
        </div>

        <div className="grid gap-5 p-4 md:grid-cols-2">
          <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
            <div>
              <Label>{t('global.kill_switch')}</Label>
              <p className="mt-1 text-muted-foreground text-xs">
                {t('global.kill_switch_description')}
              </p>
            </div>
            <Switch
              checked={globalSettings.globallyEnabled}
              onCheckedChange={(globallyEnabled) =>
                setGlobalSettings((current) => ({
                  ...current,
                  globallyEnabled,
                }))
              }
            />
          </div>
          <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
            <div>
              <Label>{t('global.workspace_default')}</Label>
              <p className="mt-1 text-muted-foreground text-xs">
                {t('global.workspace_default_description')}
              </p>
            </div>
            <Switch
              checked={globalSettings.workspaceDefaultEnabled}
              onCheckedChange={(workspaceDefaultEnabled) =>
                setGlobalSettings((current) => ({
                  ...current,
                  workspaceDefaultEnabled,
                }))
              }
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="default-models">{t('global.default_models')}</Label>
            <Input
              id="default-models"
              value={globalSettings.defaultModels.join(', ')}
              onChange={(event) =>
                setGlobalSettings((current) => ({
                  ...current,
                  defaultModels: parseModels(event.target.value),
                }))
              }
              placeholder="openai/gpt-5, google/gemini-2.5-pro"
            />
            <p className="text-muted-foreground text-xs">
              {t('global.models_hint')}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="metadata-retention">
              {t('global.metadata_retention')}
            </Label>
            <Input
              id="metadata-retention"
              min={30}
              max={2555}
              type="number"
              value={globalSettings.metadataRetentionDays}
              onChange={(event) =>
                setGlobalSettings((current) => ({
                  ...current,
                  metadataRetentionDays: Number(event.target.value),
                }))
              }
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="content-retention">
              {t('global.content_retention')}
            </Label>
            <Input
              id="content-retention"
              min={1}
              max={365}
              type="number"
              value={globalSettings.contentRetentionDays}
              onChange={(event) =>
                setGlobalSettings((current) => ({
                  ...current,
                  contentRetentionDays: Number(event.target.value),
                }))
              }
            />
          </div>
          <div className="flex items-start justify-between gap-4 rounded-lg border p-4 md:col-span-2">
            <div>
              <Label>{t('global.capture_default')}</Label>
              <p className="mt-1 text-muted-foreground text-xs">
                {t('global.capture_default_description')}
              </p>
            </div>
            <Switch
              checked={globalSettings.captureDefaultEnabled}
              onCheckedChange={(captureDefaultEnabled) =>
                setGlobalSettings((current) => ({
                  ...current,
                  captureDefaultEnabled,
                }))
              }
            />
          </div>
        </div>
        <div className="flex justify-end border-t p-4">
          <Button disabled={isPending} onClick={saveGlobalSettings}>
            <Save className="mr-2 h-4 w-4" />
            {t('save')}
          </Button>
        </div>
      </section>

      <section className="rounded-xl border bg-card">
        <div className="space-y-4 border-b p-4">
          <div>
            <div className="flex items-center gap-2 font-semibold">
              <ShieldCheck className="h-4 w-4 text-primary" />
              {t('workspaces.title')}
            </div>
            <p className="mt-1 text-muted-foreground text-sm">
              {t('workspaces.description')}
            </p>
          </div>
          <div className="relative">
            <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t('workspaces.search')}
            />
          </div>
        </div>
        <div className="divide-y">
          {filteredPolicies.map((policy) => (
            <article className="space-y-4 p-4" key={policy.wsId}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <h3 className="truncate font-medium">
                    {policy.workspaceName}
                  </h3>
                  <p className="truncate font-mono text-muted-foreground text-xs">
                    {policy.wsId}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={policy.state}
                    onValueChange={(state) =>
                      updateWorkspacePolicy(policy.wsId, {
                        state: state as AiStudioPolicyState,
                      })
                    }
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inherit">
                        {t('status.inherit')}
                      </SelectItem>
                      <SelectItem value="enabled">
                        {t('status.enabled')}
                      </SelectItem>
                      <SelectItem value="disabled">
                        {t('status.disabled')}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    disabled={isPending}
                    size="sm"
                    onClick={() => saveWorkspacePolicy(policy)}
                  >
                    <Save className="mr-2 h-4 w-4" />
                    {t('save')}
                  </Button>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="space-y-1.5 xl:col-span-2">
                  <Label>{t('workspaces.allowed_models')}</Label>
                  <Input
                    value={policy.allowedModels.join(', ')}
                    onChange={(event) =>
                      updateWorkspacePolicy(policy.wsId, {
                        allowedModels: parseModels(event.target.value),
                      })
                    }
                    placeholder={t('workspaces.inherit_models')}
                  />
                </div>
                <div className="space-y-1.5 xl:col-span-2">
                  <Label>{t('workspaces.denied_models')}</Label>
                  <Input
                    value={policy.deniedModels.join(', ')}
                    onChange={(event) =>
                      updateWorkspacePolicy(policy.wsId, {
                        deniedModels: parseModels(event.target.value),
                      })
                    }
                    placeholder={t('workspaces.none')}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('workspaces.rate_limit')}</Label>
                  <Input
                    min={1}
                    type="number"
                    value={policy.requestsPerMinute ?? ''}
                    onChange={(event) =>
                      updateWorkspacePolicy(policy.wsId, {
                        requestsPerMinute: optionalNumber(event.target.value),
                      })
                    }
                    placeholder={t('workspaces.inherit')}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('workspaces.credit_budget')}</Label>
                  <Input
                    min={0}
                    step="0.000001"
                    type="number"
                    value={policy.monthlyCreditBudget ?? ''}
                    onChange={(event) =>
                      updateWorkspacePolicy(policy.wsId, {
                        monthlyCreditBudget: optionalNumber(event.target.value),
                      })
                    }
                    placeholder={t('workspaces.inherit')}
                  />
                </div>
                <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <Label>{t('workspaces.no_training')}</Label>
                  <Switch
                    checked={policy.noTrainingEnforced}
                    onCheckedChange={(noTrainingEnforced) =>
                      updateWorkspacePolicy(policy.wsId, {
                        noTrainingEnforced,
                      })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('workspaces.capture')}</Label>
                  <Select
                    value={
                      policy.captureEnabled === null
                        ? 'inherit'
                        : policy.captureEnabled
                          ? 'enabled'
                          : 'disabled'
                    }
                    onValueChange={(value) =>
                      updateWorkspacePolicy(policy.wsId, {
                        captureEnabled:
                          value === 'inherit' ? null : value === 'enabled',
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inherit">
                        {t('status.inherit')}
                      </SelectItem>
                      <SelectItem value="enabled">
                        {t('status.enabled')}
                      </SelectItem>
                      <SelectItem value="disabled">
                        {t('status.disabled')}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>{t('workspaces.metadata_retention')}</Label>
                  <Input
                    min={30}
                    max={2555}
                    type="number"
                    value={policy.metadataRetentionDays ?? ''}
                    onChange={(event) =>
                      updateWorkspacePolicy(policy.wsId, {
                        metadataRetentionDays: optionalNumber(
                          event.target.value
                        ),
                      })
                    }
                    placeholder={t('workspaces.inherit')}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t('workspaces.content_retention')}</Label>
                  <Input
                    min={1}
                    max={365}
                    type="number"
                    value={policy.contentRetentionDays ?? ''}
                    onChange={(event) =>
                      updateWorkspacePolicy(policy.wsId, {
                        contentRetentionDays: optionalNumber(
                          event.target.value
                        ),
                      })
                    }
                    placeholder={t('workspaces.inherit')}
                  />
                </div>
              </div>
            </article>
          ))}
          {filteredPolicies.length === 0 ? (
            <div className="p-10 text-center text-muted-foreground text-sm">
              {t('workspaces.empty')}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
