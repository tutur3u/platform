'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getOptionalWorkspaceConfig,
  updateWorkspaceConfig,
} from '@tuturuuu/internal-api/workspace-configs';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import { toast } from '@tuturuuu/ui/sonner';
import { Switch } from '@tuturuuu/ui/switch';
import { useTranslations } from 'next-intl';

const CONFIG_ID = 'ALLOW_BULK_REPORT_APPROVAL';

export function ReportBulkApprovalSetting({
  wsId,
  canManage,
}: {
  wsId: string;
  canManage: boolean;
}) {
  const t = useTranslations('settings.approvals');
  const queryClient = useQueryClient();
  const queryKey = ['workspace-config', wsId, CONFIG_ID];
  const setting = useQuery({
    queryKey,
    queryFn: () => getOptionalWorkspaceConfig(wsId, CONFIG_ID),
    enabled: canManage && !!wsId,
  });
  const update = useMutation({
    mutationFn: (enabled: boolean) =>
      updateWorkspaceConfig(wsId, CONFIG_ID, enabled ? 'true' : 'false'),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({ queryKey: ['ws', wsId, 'approvals'] }),
      ]);
      toast.success(t('update_success'));
    },
    onError: () => toast.error(t('update_error')),
  });
  if (!canManage) return null;
  return (
    <SettingItemTab
      title={t('allow_bulk_report_approval')}
      description={
        setting.isError
          ? t('bulk_report_setting_load_error')
          : t('allow_bulk_report_approval_description')
      }
    >
      <Switch
        aria-label={t('allow_bulk_report_approval')}
        checked={!setting.isError && setting.data?.value === 'true'}
        disabled={setting.isPending || setting.isError || update.isPending}
        onCheckedChange={(enabled) => update.mutate(enabled)}
      />
    </SettingItemTab>
  );
}
