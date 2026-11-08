'use client';

import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import { SettingsSection } from '@tuturuuu/ui/custom/settings-section';
import { useUpdateUserConfig } from '@tuturuuu/ui/hooks/use-user-config';
import { toast } from '@tuturuuu/ui/sonner';
import {
  DEFAULT_REQUIRE_ATTENTION_COLOR,
  REQUIRE_ATTENTION_COLOR_CONFIG_ID,
} from '@tuturuuu/users-core/lib/user-feedbacks';
import { useRequireAttentionColor } from '@tuturuuu/users-ui/hooks/use-require-attention-color';
import { useTranslations } from 'next-intl';
import { ColorPicker } from '../calendar/color-picker';

export function RequireAttentionColorSettings() {
  const t = useTranslations('settings.user_management');
  const { color, textClassName } = useRequireAttentionColor();
  const updateConfig = useUpdateUserConfig();

  const handleChange = async (nextColor: typeof color) => {
    try {
      await updateConfig.mutateAsync({
        configId: REQUIRE_ATTENTION_COLOR_CONFIG_ID,
        value: nextColor || DEFAULT_REQUIRE_ATTENTION_COLOR,
      });
      toast.success(t('update_success'));
    } catch {
      toast.error(t('update_error'));
    }
  };

  return (
    <SettingsSection>
      <SettingItemTab
        layout="stacked"
        title={t('require_attention_color_label')}
        description={t('require_attention_color_help')}
      >
        <ColorPicker value={color} onChange={handleChange} />
      </SettingItemTab>

      <SettingItemTab layout="stacked" title={t('preview')}>
        <p className="text-sm">
          {t('preview_copy')}{' '}
          <span className={textClassName}>{t('preview_name')}</span>
        </p>
      </SettingItemTab>
    </SettingsSection>
  );
}
