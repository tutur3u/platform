'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  APP_COORDINATION_SESSION_POLICY_LIMITS,
  DEFAULT_APP_COORDINATION_SESSION_POLICY,
} from '@tuturuuu/auth/app-session-policy';
import { Loader2, Plus, RotateCcw, Save, Trash2 } from '@tuturuuu/icons';
import {
  type AppCoordinationSessionPolicy,
  type AppCoordinationSessionPolicyResponse,
  getAppCoordinationSessionPolicy,
  saveAppCoordinationSessionPolicy,
} from '@tuturuuu/internal-api/infrastructure';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

const QUERY_KEY = ['infrastructure', 'app-coordination'];
const POLICY_FIELDS = [
  'internalAppAccessTtlSeconds',
  'internalAppRefreshTtlSeconds',
  'internalAppRefreshEarlySeconds',
  'browserRefreshReplayGraceSeconds',
  'externalAppBearerTtlSeconds',
  'externalAppRefreshReplayGraceSeconds',
  'cliAccessTtlSeconds',
  'cliRefreshTtlSeconds',
] as const;
const OVERRIDE_FIELDS = [
  'internalAppAccessTtlSeconds',
  'internalAppRefreshTtlSeconds',
  'internalAppRefreshEarlySeconds',
] as const;

type PolicyField = (typeof POLICY_FIELDS)[number];
type OverrideField = (typeof OVERRIDE_FIELDS)[number];

function formatDuration(seconds: number) {
  if (seconds % 86_400 === 0) {
    return `${seconds / 86_400}d`;
  }

  if (seconds % 3_600 === 0) {
    return `${seconds / 3_600}h`;
  }

  if (seconds % 60 === 0) {
    return `${seconds / 60}m`;
  }

  return `${seconds}s`;
}

function clonePolicy(policy: AppCoordinationSessionPolicy) {
  return {
    ...policy,
    internalAppOverrides: Object.fromEntries(
      Object.entries(policy.internalAppOverrides ?? {}).map(
        ([appId, override]) => [appId, { ...override }]
      )
    ),
  };
}

function NumberField({
  field,
  onChange,
  value,
}: {
  field: PolicyField;
  onChange: (value: number) => void;
  value: number;
}) {
  const t = useTranslations('app-coordination-settings');
  const limits = APP_COORDINATION_SESSION_POLICY_LIMITS[field];

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Label htmlFor={field}>{t(`fields.${field}.label`)}</Label>
          <p className="mt-1 text-muted-foreground text-sm">
            {t(`fields.${field}.description`)}
          </p>
        </div>
        <Button
          aria-label={t('actions.reset_field')}
          size="icon"
          type="button"
          variant="ghost"
          onClick={() => onChange(limits.defaultValue)}
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          id={field}
          max={limits.max}
          min={limits.min}
          step={field.includes('Early') || field.includes('Grace') ? 30 : 300}
          type="number"
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <span className="whitespace-nowrap text-muted-foreground text-sm">
          {t('duration_bounds', {
            max: `${limits.max} (${formatDuration(limits.max)})`,
            min: `${limits.min} (${formatDuration(limits.min)})`,
            value: formatDuration(value),
          })}
        </span>
      </div>
    </div>
  );
}

function OverrideRows({
  onChange,
  policy,
}: {
  onChange: (policy: AppCoordinationSessionPolicy) => void;
  policy: AppCoordinationSessionPolicy;
}) {
  const t = useTranslations('app-coordination-settings');
  const rows = useMemo(
    () => Object.entries(policy.internalAppOverrides ?? {}).sort(),
    [policy.internalAppOverrides]
  );

  function updateOverride(appId: string, field: OverrideField, value: number) {
    onChange({
      ...policy,
      internalAppOverrides: {
        ...policy.internalAppOverrides,
        [appId]: {
          ...policy.internalAppOverrides[appId],
          [field]: value,
        },
      },
    });
  }

  function removeOverride(appId: string) {
    const next = { ...policy.internalAppOverrides };
    delete next[appId];
    onChange({ ...policy, internalAppOverrides: next });
  }

  function addOverride(formData: FormData) {
    const appId = String(formData.get('appId') ?? '')
      .trim()
      .toLowerCase();

    if (!/^[a-z0-9_-]{1,64}$/u.test(appId)) {
      toast.error(t('errors.invalid_app_id'));
      return;
    }

    onChange({
      ...policy,
      internalAppOverrides: {
        ...policy.internalAppOverrides,
        [appId]: {
          internalAppAccessTtlSeconds: policy.internalAppAccessTtlSeconds,
          internalAppRefreshEarlySeconds: policy.internalAppRefreshEarlySeconds,
          internalAppRefreshTtlSeconds: policy.internalAppRefreshTtlSeconds,
        },
      },
    });
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div>
        <h2 className="font-semibold text-lg">{t('overrides.title')}</h2>
        <p className="text-muted-foreground text-sm">
          {t('overrides.description')}
        </p>
      </div>

      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          addOverride(new FormData(event.currentTarget));
          event.currentTarget.reset();
        }}
      >
        <Input
          aria-label={t('overrides.app_id')}
          name="appId"
          pattern="[a-z0-9_-]{1,64}"
          placeholder="learn"
        />
        <Button type="submit" variant="secondary">
          <Plus className="h-4 w-4" />
          {t('actions.add_override')}
        </Button>
      </form>

      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('overrides.empty')}</p>
      ) : (
        <div className="space-y-3">
          {rows.map(([appId, override]) => (
            <div
              className="grid gap-3 rounded-lg border border-border p-3 lg:grid-cols-[minmax(8rem,1fr)_repeat(3,minmax(9rem,1fr))_auto]"
              key={appId}
            >
              <div>
                <Label>{t('overrides.app_id')}</Label>
                <div className="mt-2 font-mono text-sm">{appId}</div>
              </div>
              {OVERRIDE_FIELDS.map((field) => {
                const limits = APP_COORDINATION_SESSION_POLICY_LIMITS[field];
                return (
                  <div className="space-y-2" key={field}>
                    <Label htmlFor={`${appId}-${field}`}>
                      {t(`override_fields.${field}`)}
                    </Label>
                    <Input
                      id={`${appId}-${field}`}
                      max={limits.max}
                      min={limits.min}
                      step={field.includes('Early') ? 30 : 300}
                      type="number"
                      value={override[field] ?? policy[field]}
                      onChange={(event) =>
                        updateOverride(appId, field, Number(event.target.value))
                      }
                    />
                  </div>
                );
              })}
              <Button
                aria-label={t('actions.remove_override')}
                className="self-end"
                size="icon"
                type="button"
                variant="ghost"
                onClick={() => removeOverride(appId)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AppCoordinationClient({
  initialPolicy,
}: {
  initialPolicy: AppCoordinationSessionPolicyResponse;
}) {
  const t = useTranslations('app-coordination-settings');
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState(() => clonePolicy(initialPolicy.policy));
  const query = useQuery({
    initialData: initialPolicy,
    queryFn: () => getAppCoordinationSessionPolicy(),
    queryKey: QUERY_KEY,
  });
  const mutation = useMutation({
    mutationFn: (policy: AppCoordinationSessionPolicy) =>
      saveAppCoordinationSessionPolicy(policy),
    onSuccess: (data) => {
      queryClient.setQueryData(QUERY_KEY, data);
      setDraft(clonePolicy(data.policy));
      toast.success(t('messages.saved'));
    },
    onError: () => {
      toast.error(t('messages.save_failed'));
    },
  });

  function updateField(field: PolicyField, value: number) {
    setDraft((current) => ({
      ...current,
      [field]: value,
    }));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 text-muted-foreground text-sm sm:flex-row sm:items-center sm:justify-between">
        <span>{t(`source.${query.data.source}`)}</span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              setDraft(clonePolicy(DEFAULT_APP_COORDINATION_SESSION_POLICY))
            }
          >
            <RotateCcw className="h-4 w-4" />
            {t('actions.reset_all')}
          </Button>
          <Button
            disabled={mutation.isPending}
            type="button"
            onClick={() => mutation.mutate(draft)}
          >
            {mutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {t('actions.save')}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {POLICY_FIELDS.map((field) => (
          <NumberField
            field={field}
            key={field}
            value={draft[field]}
            onChange={(value) => updateField(field, value)}
          />
        ))}
      </div>

      <OverrideRows policy={draft} onChange={setDraft} />
    </div>
  );
}
