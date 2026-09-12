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
import { toast } from '@tuturuuu/ui/sonner';
import {
  normalizeUnprioritizedPosition,
  TASK_UNPRIORITIZED_POSITION_CONFIG_ID,
} from '@tuturuuu/utils/task-helper/task-sort';
import { useTranslations } from 'next-intl';

export function TaskPrioritySettings() {
  const t = useTranslations('settings.tasks');
  const { data, isLoading } = useUserConfig(
    TASK_UNPRIORITIZED_POSITION_CONFIG_ID,
    'first'
  );
  const update = useUpdateUserConfig();
  return (
    <SettingItemTab
      title={t('unprioritized_position')}
      description={t('unprioritized_position_description')}
    >
      <Select
        value={normalizeUnprioritizedPosition(data)}
        disabled={isLoading || update.isPending}
        onValueChange={(value) =>
          update.mutate(
            {
              configId: TASK_UNPRIORITIZED_POSITION_CONFIG_ID,
              value: normalizeUnprioritizedPosition(value),
            },
            {
              onError: () => toast.error(t('settings_update_failed')),
            }
          )
        }
      >
        <SelectTrigger
          className="w-44"
          aria-label={t('unprioritized_position')}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="first">{t('unprioritized_first')}</SelectItem>
          <SelectItem value="last">{t('unprioritized_last')}</SelectItem>
        </SelectContent>
      </Select>
    </SettingItemTab>
  );
}
