'use client';

import {
  isTaskRememberLastBoardEnabled,
  serializeTaskRememberLastBoard,
  TASK_REMEMBER_LAST_BOARD_CONFIG_ID,
} from '@tuturuuu/internal-api/users';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import {
  useUpdateUserWorkspaceConfig,
  useUserWorkspaceConfig,
} from '@tuturuuu/ui/hooks/use-user-workspace-config';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';

interface RememberLastBoardSettingsProps {
  className?: string;
  compact?: boolean;
  wsId: string;
}

export function RememberLastBoardSettings({
  className,
  compact = false,
  wsId,
}: RememberLastBoardSettingsProps) {
  const t = useTranslations();
  const { data: rememberLastBoardRaw, isLoading } = useUserWorkspaceConfig(
    wsId,
    TASK_REMEMBER_LAST_BOARD_CONFIG_ID,
    'true'
  );
  const updateConfig = useUpdateUserWorkspaceConfig();
  const enabled = isTaskRememberLastBoardEnabled(rememberLastBoardRaw);
  const title = t('settings.tasks.remember_last_board');
  const description = t('settings.tasks.remember_last_board_description');
  const switchControl = (
    <Switch
      aria-label={title}
      checked={enabled}
      disabled={isLoading || updateConfig.isPending}
      onCheckedChange={(checked) =>
        updateConfig.mutate(
          {
            configId: TASK_REMEMBER_LAST_BOARD_CONFIG_ID,
            value: serializeTaskRememberLastBoard(checked),
            workspaceId: wsId,
          },
          {
            onSuccess: () =>
              toast.success(t('settings.tasks.remember_last_board_saved')),
            onError: () =>
              toast.error(t('settings.tasks.remember_last_board_save_failed')),
          }
        )
      }
    />
  );

  if (compact) {
    return (
      <div
        className={cn(
          'flex items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2',
          className
        )}
      >
        <div className="min-w-0">
          <p className="font-medium text-sm">{title}</p>
          <p className="text-muted-foreground text-xs">{description}</p>
        </div>
        {switchControl}
      </div>
    );
  }

  return (
    <div className={className}>
      <SettingItemTab title={title} description={description}>
        {switchControl}
      </SettingItemTab>
    </div>
  );
}
