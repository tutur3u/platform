'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateWorkspaceConfig } from '@tuturuuu/internal-api/workspace-configs';
import { Button } from '@tuturuuu/ui/button';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import {
  SettingsSection,
  SettingsSectionBlock,
  SettingsSectionFooter,
  SettingsSectionMessage,
} from '@tuturuuu/ui/custom/settings-section';
import { Input } from '@tuturuuu/ui/input';
import { Skeleton } from '@tuturuuu/ui/skeleton';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { type FormEvent, useId, useState } from 'react';
import {
  USER_STATUS_LABEL_KEYS,
  USER_STATUS_LABELS_CONFIG_ID,
  type UserStatusLabels,
  useDefaultUserStatusLabels,
  useUserStatusLabelOverrides,
  userStatusLabelsQueryKey,
} from '../hooks/use-user-status-labels';

type LabelKey = keyof UserStatusLabels;

const HELP_KEYS = {
  archived: 'archived_help',
  archived_until: 'archived_until_help',
  permanently_archived: 'permanently_archived_help',
} as const satisfies Record<LabelKey, string>;

const TITLE_KEYS = {
  archived: 'archived',
  archived_until: 'archived_until',
  permanently_archived: 'permanently_archived',
} as const satisfies Record<LabelKey, string>;

/**
 * Workspace-wide names for contact archive statuses. Empty fields fall back to
 * the localized defaults, so only real overrides are stored.
 */
export function ContactLabelsSettings({ wsId }: { wsId: string }) {
  const t = useTranslations('contact-labels-settings');
  const overrides = useUserStatusLabelOverrides(wsId);

  if (overrides.status === 'pending') {
    return (
      <SettingsSection title={t('archive_section')}>
        {USER_STATUS_LABEL_KEYS.map((key) => (
          <SettingsSectionBlock className="space-y-2" key={key}>
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-9 w-full" />
          </SettingsSectionBlock>
        ))}
      </SettingsSection>
    );
  }

  if (overrides.status === 'error') {
    return (
      <SettingsSection title={t('archive_section')}>
        <SettingsSectionMessage
          tone="error"
          action={
            <Button
              size="sm"
              type="button"
              variant="outline"
              onClick={() => overrides.refetch()}
            >
              {t('retry')}
            </Button>
          }
        >
          {t('load_error')}
        </SettingsSectionMessage>
      </SettingsSection>
    );
  }

  return (
    <ContactLabelsForm
      key={JSON.stringify(overrides.data)}
      initialOverrides={overrides.data}
      wsId={wsId}
    />
  );
}

function ContactLabelsForm({
  initialOverrides,
  wsId,
}: {
  initialOverrides: Partial<UserStatusLabels>;
  wsId: string;
}) {
  const t = useTranslations('contact-labels-settings');
  const defaults = useDefaultUserStatusLabels();
  const queryClient = useQueryClient();
  const formId = useId();
  const [values, setValues] = useState<Record<LabelKey, string>>(() => ({
    archived: initialOverrides.archived ?? '',
    archived_until: initialOverrides.archived_until ?? '',
    permanently_archived: initialOverrides.permanently_archived ?? '',
  }));

  const save = useMutation({
    mutationFn: (next: Partial<UserStatusLabels>) =>
      updateWorkspaceConfig(
        wsId,
        USER_STATUS_LABELS_CONFIG_ID,
        JSON.stringify(next)
      ),
    onSuccess: (_, next) => {
      queryClient.setQueryData(userStatusLabelsQueryKey(wsId), next);
      toast.success(t('update_success'));
    },
    onError: () => toast.error(t('update_error')),
  });

  const trimmed = Object.fromEntries(
    USER_STATUS_LABEL_KEYS.flatMap((key) => {
      const value = values[key].trim();
      return value ? [[key, value]] : [];
    })
  ) as Partial<UserStatusLabels>;
  const isDirty = USER_STATUS_LABEL_KEYS.some(
    (key) => (trimmed[key] ?? '') !== (initialOverrides[key] ?? '')
  );
  const hasOverrides = USER_STATUS_LABEL_KEYS.some((key) => values[key]);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isDirty) save.mutate(trimmed);
  };

  return (
    <SettingsSection title={t('archive_section')}>
      <form onSubmit={onSubmit}>
        {USER_STATUS_LABEL_KEYS.map((key) => {
          const inputId = `${formId}-${key}`;
          return (
            <SettingItemTab
              key={key}
              controlWidth="xl"
              description={t(HELP_KEYS[key])}
              title={<label htmlFor={inputId}>{t(TITLE_KEYS[key])}</label>}
            >
              <Input
                id={inputId}
                maxLength={64}
                placeholder={defaults[key]}
                value={values[key]}
                disabled={save.isPending}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    [key]: event.target.value,
                  }))
                }
              />
            </SettingItemTab>
          );
        })}
        <SettingsSectionFooter>
          <Button
            size="sm"
            type="button"
            variant="ghost"
            disabled={!hasOverrides || save.isPending}
            onClick={() =>
              setValues({
                archived: '',
                archived_until: '',
                permanently_archived: '',
              })
            }
          >
            {t('reset')}
          </Button>
          <Button size="sm" type="submit" disabled={!isDirty || save.isPending}>
            {save.isPending ? t('saving') : t('save')}
          </Button>
        </SettingsSectionFooter>
      </form>
    </SettingsSection>
  );
}
