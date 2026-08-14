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
import { Separator } from '@tuturuuu/ui/separator';
import { useTranslations } from 'next-intl';
import {
  normalizeTaskDialogPresentation,
  TASK_DIALOG_CREATE_PRESENTATION_CONFIG_ID,
  TASK_DIALOG_DEFAULT_PRESENTATION_CONFIG_ID,
  TASK_DIALOG_EDIT_PRESENTATION_CONFIG_ID,
  TASK_DOCUMENT_CREATE_PRESENTATION_CONFIG_ID,
  TASK_DOCUMENT_EDIT_PRESENTATION_CONFIG_ID,
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

export function TaskDialogPresentationSettings() {
  const { data: legacyTaskEditPresentation } = useUserConfig(
    TASK_DIALOG_DEFAULT_PRESENTATION_CONFIG_ID,
    'focused'
  );

  return (
    <>
      {PREFERENCES.map(([configId, label, fallback], index) => (
        <div key={configId} className="contents">
          {index > 0 && <Separator />}
          <PresentationSelect
            configId={configId}
            fallback={
              configId === TASK_DIALOG_EDIT_PRESENTATION_CONFIG_ID
                ? normalizeTaskDialogPresentation(legacyTaskEditPresentation)
                : fallback
            }
            label={label}
          />
        </div>
      ))}
    </>
  );
}
