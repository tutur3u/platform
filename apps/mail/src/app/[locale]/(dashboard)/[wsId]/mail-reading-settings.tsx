'use client';
import { SettingItemTab } from '@tuturuuu/ui/custom/settings-item-tab';
import { SettingsSection } from '@tuturuuu/ui/custom/settings-section';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useTranslations } from 'next-intl';
import { MailKeyboardSetting } from './mail-keyboard-help';
import { useMailPreviewAppearance } from './mail-preview-appearance';
import { useMailArchiveBehavior } from './mail-reading-preferences';

export function MailReadingSettings() {
  const t = useTranslations('mail');
  const [behavior, setBehavior] = useMailArchiveBehavior();
  const [appearance, setAppearance] = useMailPreviewAppearance();
  return (
    <SettingsSection>
      <MailKeyboardSetting />
      <SettingItemTab
        title={<Label htmlFor="mail-after-archive">{t('after_archive')}</Label>}
        controlWidth="md"
      >
        <Select
          value={behavior}
          onValueChange={(value) => {
            if (value === 'next' || value === 'list') setBehavior(value);
          }}
        >
          <SelectTrigger id="mail-after-archive">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="next">{t('archive_next')}</SelectItem>
            <SelectItem value="list">{t('archive_list')}</SelectItem>
          </SelectContent>
        </Select>
      </SettingItemTab>
      <SettingItemTab
        title={
          <Label htmlFor="mail-content-appearance">
            {t('message_appearance')}
          </Label>
        }
        controlWidth="md"
      >
        <Select
          value={appearance}
          onValueChange={(value) => {
            if (value === 'auto' || value === 'dark' || value === 'original')
              setAppearance(value);
          }}
        >
          <SelectTrigger id="mail-content-appearance">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="auto">{t('app_theme_view')}</SelectItem>
            <SelectItem value="dark">{t('dark_view')}</SelectItem>
            <SelectItem value="original">{t('original_view')}</SelectItem>
          </SelectContent>
        </Select>
      </SettingItemTab>
    </SettingsSection>
  );
}
