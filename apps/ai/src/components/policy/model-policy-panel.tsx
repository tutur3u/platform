'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Cpu, Info, Loader2, Lock, Save, ShieldCheck } from '@tuturuuu/icons';
import {
  getAiStudioPolicy,
  updateAiStudioPolicy,
} from '@tuturuuu/internal-api/ai-studio';
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
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { SectionCard } from '../studio/section-card';
import { StudioErrorState } from '../studio/states';
import { ModelListField } from './model-list-field';
import {
  type CaptureMode,
  EMPTY_POLICY_FORM,
  findPolicyFieldError,
  isPolicyFormDirty,
  POLICY_BOUNDS,
  type PolicyFormState,
  toPolicyFormState,
  toPolicyPayload,
} from './policy-form-state';

const CAPTURE_MODES: CaptureMode[] = ['inherit', 'on', 'off'];

const FIELD_ERROR_KEYS = {
  contentRetentionDays: 'invalid_content_retention',
  metadataRetentionDays: 'invalid_metadata_retention',
  monthlyCreditBudget: 'invalid_monthly_credit_budget',
  requestsPerMinute: 'invalid_requests_per_minute',
} as const;

export function ModelPolicyPanel({
  canManage,
  workspaceId,
}: {
  canManage: boolean;
  workspaceId: string;
}) {
  const t = useTranslations('ai-studio.policy');
  const queryClient = useQueryClient();
  const query = useQuery({
    queryFn: () => getAiStudioPolicy(workspaceId),
    queryKey: ['ai-studio-policy', workspaceId],
  });
  const [form, setForm] = useState<PolicyFormState>(EMPTY_POLICY_FORM);
  const [baseline, setBaseline] = useState<PolicyFormState>(EMPTY_POLICY_FORM);

  useEffect(() => {
    if (!query.data) return;
    const next = toPolicyFormState(query.data.policy);
    setBaseline(next);
    setForm(next);
  }, [query.data]);

  const mutation = useMutation({
    mutationFn: () => updateAiStudioPolicy(workspaceId, toPolicyPayload(form)),
    onError: () => toast.error(t('save_error')),
    onSuccess: async (result) => {
      const next = toPolicyFormState(result.policy);
      setBaseline(next);
      setForm(next);
      toast.success(t('saved'));
      await queryClient.invalidateQueries({
        queryKey: ['ai-studio-policy', workspaceId],
      });
    },
  });

  const fieldError = findPolicyFieldError(form);
  const isDirty = isPolicyFormDirty(form, baseline);
  const disabled = !canManage || mutation.isPending;
  const update = <K extends keyof PolicyFormState>(
    key: K,
    value: PolicyFormState[K]
  ) => setForm((current) => ({ ...current, [key]: value }));

  if (query.isPending) return <PolicySkeleton />;

  if (query.isError) {
    return (
      <StudioErrorState
        description={t('load_error_description')}
        onRetry={() => void query.refetch()}
        retryLabel={t('retry')}
        title={t('load_error')}
      />
    );
  }

  const globalSettings = query.data?.global;

  return (
    <div className="space-y-4">
      {canManage ? null : (
        <div className="flex items-start gap-2.5 rounded-lg border bg-muted/30 p-3 text-sm">
          <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p className="text-muted-foreground">{t('read_only')}</p>
        </div>
      )}

      <SectionCard
        description={t('model_access_description')}
        icon={Cpu}
        title={t('model_access')}
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <ModelListField
            addLabel={t('add_model')}
            description={t('allowed_models_description')}
            disabled={disabled}
            emptyLabel={t('allowed_models_empty')}
            label={t('allowed_models')}
            onChange={(value) => update('allowedModels', value)}
            placeholder="google/gemini-2.5-flash"
            removeLabel={t('remove_model')}
            value={form.allowedModels}
          />
          <ModelListField
            addLabel={t('add_model')}
            description={t('denied_models_description')}
            disabled={disabled}
            emptyLabel={t('denied_models_empty')}
            label={t('denied_models')}
            onChange={(value) => update('deniedModels', value)}
            placeholder="openai/gpt-4o"
            removeLabel={t('remove_model')}
            value={form.deniedModels}
          />
        </div>
        {globalSettings?.default_models.length ? (
          <p className="mt-5 flex items-start gap-2 border-t pt-4 text-muted-foreground text-xs">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            <span>
              {t('platform_catalog', {
                models: globalSettings.default_models.join(', '),
              })}
            </span>
          </p>
        ) : null}
      </SectionCard>

      <SectionCard
        description={t('limits_description')}
        icon={ShieldCheck}
        title={t('limits')}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            disabled={disabled}
            hint={t('requests_per_minute_hint')}
            invalid={fieldError === 'requestsPerMinute'}
            label={t('requests_per_minute')}
            max={POLICY_BOUNDS.requestsPerMinute.max}
            min={POLICY_BOUNDS.requestsPerMinute.min}
            onChange={(value) => update('requestsPerMinute', value)}
            placeholder={t('unlimited')}
            value={form.requestsPerMinute}
          />
          <NumberField
            disabled={disabled}
            hint={t('monthly_credit_budget_hint')}
            invalid={fieldError === 'monthlyCreditBudget'}
            label={t('monthly_credit_budget')}
            min={0}
            onChange={(value) => update('monthlyCreditBudget', value)}
            placeholder={t('unlimited')}
            step="0.0001"
            value={form.monthlyCreditBudget}
          />
        </div>
      </SectionCard>

      <SectionCard
        description={t('data_handling_description')}
        icon={Lock}
        title={t('data_handling')}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-2">
            <Label>{t('capture')}</Label>
            <p className="text-muted-foreground text-xs leading-relaxed">
              {t('capture_hint', {
                fallback: globalSettings?.capture_default_enabled
                  ? t('capture_on')
                  : t('capture_off'),
              })}
            </p>
            <Select
              disabled={disabled}
              onValueChange={(value) =>
                update('captureMode', value as CaptureMode)
              }
              value={form.captureMode}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CAPTURE_MODES.map((mode) => (
                  <SelectItem key={mode} value={mode}>
                    {t(`capture_${mode}` as Parameters<typeof t>[0])}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <NumberField
            disabled={disabled}
            hint={t('content_retention_hint', {
              fallback: globalSettings?.content_retention_days ?? 30,
            })}
            invalid={fieldError === 'contentRetentionDays'}
            label={t('content_retention')}
            max={POLICY_BOUNDS.contentRetentionDays.max}
            min={POLICY_BOUNDS.contentRetentionDays.min}
            onChange={(value) => update('contentRetentionDays', value)}
            placeholder={t('inherit_placeholder')}
            value={form.contentRetentionDays}
          />
          <NumberField
            disabled={disabled}
            hint={t('metadata_retention_hint', {
              fallback: globalSettings?.metadata_retention_days ?? 365,
            })}
            invalid={fieldError === 'metadataRetentionDays'}
            label={t('metadata_retention')}
            max={POLICY_BOUNDS.metadataRetentionDays.max}
            min={POLICY_BOUNDS.metadataRetentionDays.min}
            onChange={(value) => update('metadataRetentionDays', value)}
            placeholder={t('inherit_placeholder')}
            value={form.metadataRetentionDays}
          />
        </div>
        <div className="mt-5 flex items-start justify-between gap-4 border-t pt-4">
          <div className="min-w-0">
            <Label htmlFor="no-training">{t('no_training')}</Label>
            <p className="mt-1 max-w-xl text-muted-foreground text-xs leading-relaxed">
              {t('no_training_hint')}
            </p>
          </div>
          <Switch
            checked={form.noTrainingEnforced}
            disabled={disabled}
            id="no-training"
            onCheckedChange={(checked) => update('noTrainingEnforced', checked)}
          />
        </div>
      </SectionCard>

      {canManage ? (
        <div className="sticky bottom-3 flex flex-wrap items-center gap-3 rounded-xl border bg-card/95 p-3 shadow-lg backdrop-blur">
          <p className="flex-1 text-muted-foreground text-sm">
            {fieldError
              ? t(FIELD_ERROR_KEYS[fieldError] as Parameters<typeof t>[0])
              : isDirty
                ? t('unsaved')
                : t('up_to_date')}
          </p>
          <Button
            disabled={!isDirty || mutation.isPending}
            onClick={() => setForm(baseline)}
            type="button"
            variant="outline"
          >
            {t('reset')}
          </Button>
          <Button
            disabled={!isDirty || Boolean(fieldError) || mutation.isPending}
            onClick={() => mutation.mutate()}
            type="button"
          >
            {mutation.isPending ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Save className="mr-2 size-4" />
            )}
            {t('save')}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function NumberField({
  disabled,
  hint,
  invalid,
  label,
  max,
  min,
  onChange,
  placeholder,
  step,
  value,
}: {
  disabled?: boolean;
  hint: string;
  invalid?: boolean;
  label: string;
  max?: number;
  min?: number;
  onChange: (value: string) => void;
  placeholder: string;
  step?: string;
  value: string;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <p className="text-muted-foreground text-xs leading-relaxed">{hint}</p>
      <Input
        aria-invalid={invalid}
        className={invalid ? 'border-dynamic-red' : undefined}
        disabled={disabled}
        max={max}
        min={min}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        step={step}
        type="number"
        value={value}
      />
    </div>
  );
}

function PolicySkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, index) => (
        <div className="rounded-xl border p-4" key={index}>
          <Skeleton className="h-5 w-40" />
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
