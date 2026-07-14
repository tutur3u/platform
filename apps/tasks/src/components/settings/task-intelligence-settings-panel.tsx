'use client';

import {
  TASK_PROGRESS_AI_CATCHUPS_CONFIG_ID,
  TASK_PROGRESS_CATCHUP_CADENCE_CONFIG_ID,
  TASK_PROGRESS_GOAL_STYLE_CONFIG_ID,
  TASK_PROGRESS_SHOW_DECISIONS_CONFIG_ID,
} from '@tuturuuu/internal-api/users';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import {
  useUpdateUserWorkspaceConfig,
  useUserWorkspaceConfig,
} from '@tuturuuu/ui/hooks/use-user-workspace-config';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Separator } from '@tuturuuu/ui/separator';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';

export function TaskIntelligenceSettingsPanel({ wsId }: { wsId: string }) {
  const t = useTranslations('settings.tasks.intelligence');
  const updateConfig = useUpdateUserWorkspaceConfig();
  const aiCatchups = useUserWorkspaceConfig(
    wsId,
    TASK_PROGRESS_AI_CATCHUPS_CONFIG_ID,
    'false'
  );
  const cadence = useUserWorkspaceConfig(
    wsId,
    TASK_PROGRESS_CATCHUP_CADENCE_CONFIG_ID,
    'weekly'
  );
  const showDecisions = useUserWorkspaceConfig(
    wsId,
    TASK_PROGRESS_SHOW_DECISIONS_CONFIG_ID,
    'true'
  );
  const goalStyle = useUserWorkspaceConfig(
    wsId,
    TASK_PROGRESS_GOAL_STYLE_CONFIG_ID,
    'adaptive'
  );
  const save = (configId: string, value: string) =>
    updateConfig.mutate({ configId, value, workspaceId: wsId });
  const disabled = updateConfig.isPending;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-dynamic-cyan/5 p-4">
        <h3 className="font-semibold">{t('autopilot_title')}</h3>
        <p className="mt-1 text-muted-foreground text-sm">
          {t('autopilot_description')}
        </p>
      </div>
      <div className="grid gap-5">
        <SettingItemTab
          description={t('show_decisions_description')}
          title={t('show_decisions')}
        >
          <Switch
            aria-label={t('show_decisions')}
            checked={showDecisions.data !== 'false'}
            disabled={disabled || showDecisions.isLoading}
            onCheckedChange={(checked) =>
              save(TASK_PROGRESS_SHOW_DECISIONS_CONFIG_ID, String(checked))
            }
          />
        </SettingItemTab>
        <Separator />
        <SettingItemTab
          description={t('goal_style_description')}
          title={t('goal_style')}
        >
          <Select
            disabled={disabled || goalStyle.isLoading}
            onValueChange={(value) =>
              save(TASK_PROGRESS_GOAL_STYLE_CONFIG_ID, value)
            }
            value={goalStyle.data ?? 'adaptive'}
          >
            <SelectTrigger aria-label={t('goal_style')} className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sustainable">
                {t('goal_sustainable')}
              </SelectItem>
              <SelectItem value="adaptive">{t('goal_adaptive')}</SelectItem>
              <SelectItem value="ambitious">{t('goal_ambitious')}</SelectItem>
            </SelectContent>
          </Select>
        </SettingItemTab>
        <Separator />
        <SettingItemTab
          description={t('ai_catchups_description')}
          title={t('ai_catchups')}
        >
          <Switch
            aria-label={t('ai_catchups')}
            checked={aiCatchups.data === 'true'}
            disabled={disabled || aiCatchups.isLoading}
            onCheckedChange={(checked) =>
              save(TASK_PROGRESS_AI_CATCHUPS_CONFIG_ID, String(checked))
            }
          />
        </SettingItemTab>
        <Separator />
        <SettingItemTab
          description={t('catchup_cadence_description')}
          title={t('catchup_cadence')}
        >
          <Select
            disabled={
              disabled || cadence.isLoading || aiCatchups.data !== 'true'
            }
            onValueChange={(value) =>
              save(TASK_PROGRESS_CATCHUP_CADENCE_CONFIG_ID, value)
            }
            value={cadence.data ?? 'weekly'}
          >
            <SelectTrigger aria-label={t('catchup_cadence')} className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="weekly">{t('weekly')}</SelectItem>
              <SelectItem value="monthly">{t('monthly')}</SelectItem>
              <SelectItem value="both">{t('weekly_monthly')}</SelectItem>
            </SelectContent>
          </Select>
        </SettingItemTab>
      </div>
      <p className="text-muted-foreground text-xs">{t('privacy_note')}</p>
    </div>
  );
}
