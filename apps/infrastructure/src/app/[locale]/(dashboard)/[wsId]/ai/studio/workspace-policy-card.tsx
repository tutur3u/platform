'use client';

import { Save } from '@tuturuuu/icons';
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
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';
import { ModelMultiSelect } from './model-multi-select';
import type { AiStudioWorkspacePolicy } from './types';

function optionalNumber(value: string) {
  if (!value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function WorkspacePolicyCard({
  isPending,
  onChange,
  onSave,
  policy,
}: {
  isPending: boolean;
  onChange: (patch: Partial<AiStudioWorkspacePolicy>) => void;
  onSave: () => void;
  policy: AiStudioWorkspacePolicy;
}) {
  const t = useTranslations('ai-studio-admin');
  const modelPickerProps = {
    emptyLabel: t('models.empty'),
    loadMoreLabel: t('models.load_more'),
    loadingLabel: t('models.loading'),
    removeLabel: (modelId: string) => t('models.remove', { modelId }),
    searchPlaceholder: t('models.search'),
    selectedCountLabel: (count: number) =>
      t('models.selected_count', { count }),
  };

  return (
    <article className="space-y-4 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <h3 className="truncate font-medium">
            {policy.workspaceName || t('workspaces.unnamed')}
          </h3>
          <p className="truncate font-mono text-muted-foreground text-xs">
            {policy.wsId}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={isPending} onClick={onSave} size="sm">
            <Save className="mr-2 h-4 w-4" />
            {t('save')}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <div className="flex items-start justify-between gap-3 rounded-lg border p-3 md:col-span-2 xl:col-span-4">
          <div>
            <Label>{t('workspaces.api_key_creation')}</Label>
            <p className="mt-1 text-muted-foreground text-xs">
              {t('workspaces.api_key_creation_description')}
            </p>
            {policy.apiKeyCreationDecidedAt ? (
              <p className="mt-1 text-muted-foreground text-xs">
                {t('workspaces.api_key_decided_at', {
                  date: new Date(
                    policy.apiKeyCreationDecidedAt
                  ).toLocaleString(),
                })}
              </p>
            ) : null}
          </div>
          <Switch
            checked={policy.apiKeyCreationApproved}
            onCheckedChange={(apiKeyCreationApproved) =>
              onChange({ apiKeyCreationApproved })
            }
          />
        </div>
        <div className="space-y-1.5 xl:col-span-2">
          <Label>{t('workspaces.allowed_models')}</Label>
          <ModelMultiSelect
            {...modelPickerProps}
            onChange={(allowedModels) => onChange({ allowedModels })}
            placeholder={t('workspaces.inherit_models')}
            value={policy.allowedModels}
          />
        </div>
        <div className="space-y-1.5 xl:col-span-2">
          <Label>{t('workspaces.denied_models')}</Label>
          <ModelMultiSelect
            {...modelPickerProps}
            onChange={(deniedModels) => onChange({ deniedModels })}
            placeholder={t('workspaces.none')}
            value={policy.deniedModels}
          />
        </div>
        <NumberPolicyField
          label={t('workspaces.rate_limit')}
          min={1}
          onChange={(requestsPerMinute) => onChange({ requestsPerMinute })}
          placeholder={t('workspaces.inherit')}
          value={policy.requestsPerMinute}
        />
        <NumberPolicyField
          label={t('workspaces.credit_budget')}
          min={0}
          onChange={(monthlyCreditBudget) => onChange({ monthlyCreditBudget })}
          placeholder={t('workspaces.inherit')}
          step="0.000001"
          value={policy.monthlyCreditBudget}
        />
        <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
          <Label>{t('workspaces.no_training')}</Label>
          <Switch
            checked={policy.noTrainingEnforced}
            onCheckedChange={(noTrainingEnforced) =>
              onChange({ noTrainingEnforced })
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label>{t('workspaces.capture')}</Label>
          <Select
            onValueChange={(value) =>
              onChange({
                captureEnabled:
                  value === 'inherit' ? null : value === 'enabled',
              })
            }
            value={
              policy.captureEnabled === null
                ? 'inherit'
                : policy.captureEnabled
                  ? 'enabled'
                  : 'disabled'
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="inherit">{t('status.inherit')}</SelectItem>
              <SelectItem value="enabled">{t('status.enabled')}</SelectItem>
              <SelectItem value="disabled">{t('status.disabled')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <NumberPolicyField
          label={t('workspaces.metadata_retention')}
          max={2555}
          min={30}
          onChange={(metadataRetentionDays) =>
            onChange({ metadataRetentionDays })
          }
          placeholder={t('workspaces.inherit')}
          value={policy.metadataRetentionDays}
        />
        <NumberPolicyField
          label={t('workspaces.content_retention')}
          max={365}
          min={1}
          onChange={(contentRetentionDays) =>
            onChange({ contentRetentionDays })
          }
          placeholder={t('workspaces.inherit')}
          value={policy.contentRetentionDays}
        />
      </div>
    </article>
  );
}

function NumberPolicyField({
  label,
  max,
  min,
  onChange,
  placeholder,
  step,
  value,
}: {
  label: string;
  max?: number;
  min: number;
  onChange: (value: number | null) => void;
  placeholder: string;
  step?: string;
  value: number | null;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        max={max}
        min={min}
        onChange={(event) => onChange(optionalNumber(event.target.value))}
        placeholder={placeholder}
        step={step}
        type="number"
        value={value ?? ''}
      />
    </div>
  );
}
