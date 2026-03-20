'use client';

import { Label } from '@tuturuuu/ui/label';
import { toast } from '@tuturuuu/ui/sonner';
import { useTranslations } from 'next-intl';
import { useRequireAttentionColor } from '@/hooks/use-require-attention-color';
import { useUpdateUserConfig } from '@/hooks/use-user-config';
import {
  DEFAULT_REQUIRE_ATTENTION_COLOR,
  REQUIRE_ATTENTION_COLOR_CONFIG_ID,
} from '@/lib/user-feedbacks';
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
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="font-medium text-lg">{t('require_attention_color')}</h3>
        <p className="text-muted-foreground text-sm">
          {t('require_attention_color_description')}
        </p>
      </div>

      <div className="space-y-3 rounded-lg border p-4">
        <Label>{t('require_attention_color_label')}</Label>
        <ColorPicker value={color} onChange={handleChange} />
        <p className="text-muted-foreground text-sm">
          {t('require_attention_color_help')}
        </p>
      </div>

      <div className="rounded-lg border border-dynamic-orange/20 bg-muted/30 p-4">
        <p className="mb-1 text-muted-foreground text-xs uppercase tracking-[0.2em]">
          {t('preview')}
        </p>
        <p className="text-sm">
          {t('preview_copy')}{' '}
          <span className={textClassName}>{t('preview_name')}</span>
        </p>
      </div>
    </div>
  );
}
