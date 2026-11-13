import type { SettingsNavGroup } from '@tuturuuu/ui/custom/settings-dialog-shell';
import type { useTranslations } from 'next-intl';
import type { SettingsDialogAvailability } from './settings-dialog-permissions';

export type SettingsTranslator = ReturnType<typeof useTranslations>;

export type SettingsNavBuilderParams = {
  availability: SettingsDialogAvailability;
  boardId?: string;
  isBillingPermissionLoading: boolean;
  t: SettingsTranslator;
  wsId?: string;
};

export type SettingsNavGroupBuilder = (
  params: SettingsNavBuilderParams
) => SettingsNavGroup[];
