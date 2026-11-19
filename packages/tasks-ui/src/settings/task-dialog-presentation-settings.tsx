'use client';

import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import {
  useUpdateUserConfig,
  useUserConfig,
} from '@tuturuuu/ui/hooks/use-user-config';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useTranslations } from 'next-intl';
import {
  normalizeTaskDialogPresentation,
  readTaskOpenMode,
  TASK_DIALOG_CREATE_PRESENTATION_CONFIG_ID,
  TASK_DIALOG_DEFAULT_PRESENTATION_CONFIG_ID,
  TASK_DIALOG_EDIT_PRESENTATION_CONFIG_ID,
  TASK_DOCUMENT_CREATE_PRESENTATION_CONFIG_ID,
  TASK_DOCUMENT_EDIT_PRESENTATION_CONFIG_ID,
  TASK_OPEN_MODE_CONFIG_ID,
  TASK_OPEN_MODES,
  type TaskDialogPresentation,
} from '../tu-do/shared/task-dialog-presentation';

const PREFERENCES = [
  [TASK_DIALOG_CREATE_PRESENTATION_CONFIG_ID, 'dialog_create_task', 'compact'],
  [TASK_DIALOG_EDIT_PRESENTATION_CONFIG_ID, 'dialog_edit_task', 'focused'],
  [
    TASK_DOCUMENT_CREATE_PRESENTATION_CONFIG_ID,
    'dialog_create_document',
    'compact',
  ],
  [
    TASK_DOCUMENT_EDIT_PRESENTATION_CONFIG_ID,
    'dialog_edit_document',
    'fullscreen',
  ],
] as const;

type PresentationLabel = (typeof PREFERENCES)[number][1];

function PresentationSelect({
  configId,
  fallback,
  label,
}: {
  configId: string;
  fallback: TaskDialogPresentation;
  label: PresentationLabel;
}) {
  const t = useTranslations('settings.tasks');
  const { data, isLoading } = useUserConfig(configId, fallback);
  const update = useUpdateUserConfig();
  const value = normalizeTaskDialogPresentation(data, fallback);

  return (
    <SettingItemTab title={t(label)} description={t(`${label}_description`)}>
      <Select
        value={value}
        onValueChange={(next) =>
          update.mutate({
            configId,
            value: normalizeTaskDialogPresentation(next, fallback),
          })
        }
        disabled={isLoading || update.isPending}
      >
        <SelectTrigger aria-label={t(label)} className="w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="compact">
            {t('dialog_presentation_compact')}
          </SelectItem>
          <SelectItem value="focused">
            {t('dialog_presentation_focused')}
          </SelectItem>
          <SelectItem value="fullscreen">
            {t('dialog_presentation_immersive')}
          </SelectItem>
        </SelectContent>
      </Select>
    </SettingItemTab>
  );
}

function OpenTasksInSetting() {
  const t = useTranslations('settings.tasks');
  const { data, isLoading } = useUserConfig(TASK_OPEN_MODE_CONFIG_ID, '');
  const update = useUpdateUserConfig();

  return (
    <SettingItemTab title={t('open_tasks_in')} controlWidth="xs">
      <Select
        value={readTaskOpenMode(data) ?? 'sidebar'}
        onValueChange={(value) => {
          const mode = readTaskOpenMode(value);
          if (mode)
            update.mutate({ configId: TASK_OPEN_MODE_CONFIG_ID, value: mode });
        }}
        disabled={isLoading || update.isPending}
      >
        <SelectTrigger aria-label={t('open_tasks_in')} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {TASK_OPEN_MODES.map((mode) => (
            <SelectItem key={mode} value={mode}>
              {t(`open_tasks_in_${mode}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </SettingItemTab>
  );
}

export function TaskDialogPresentationSettings() {
  const { data: legacyTaskEditPresentation } = useUserConfig(
    TASK_DIALOG_DEFAULT_PRESENTATION_CONFIG_ID,
    'focused'
  );

  return (
    <>
      <OpenTasksInSetting />
      {PREFERENCES.map(([configId, label, fallback]) => (
        <PresentationSelect
          configId={configId}
          fallback={
            configId === TASK_DIALOG_EDIT_PRESENTATION_CONFIG_ID
              ? normalizeTaskDialogPresentation(legacyTaskEditPresentation)
              : fallback
          }
          key={configId}
          label={label}
        />
      ))}
    </>
  );
}
