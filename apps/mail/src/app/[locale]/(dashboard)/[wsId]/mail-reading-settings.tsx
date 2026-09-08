'use client';
import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useTranslations } from 'next-intl';
import { useMailPreviewAppearance } from './mail-preview-appearance';
import { useMailArchiveBehavior } from './mail-reading-preferences';

export function MailReadingSettings() {
  const t = useTranslations('mail');
  const [behavior, setBehavior] = useMailArchiveBehavior();
  const [appearance, setAppearance] = useMailPreviewAppearance();
  return (
    <div className="space-y-6">
      <p className="text-muted-foreground text-sm">
        {t('reading_settings_description')}
      </p>
      <div className="space-y-2">
        <Label htmlFor="mail-after-archive">{t('after_archive')}</Label>
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
      </div>
      <div className="space-y-2">
        <Label htmlFor="mail-content-appearance">
          {t('message_appearance')}
        </Label>
        <Select
          value={appearance}
          onValueChange={(value) => {
            if (value === 'dark' || value === 'original') setAppearance(value);
          }}
        >
          <SelectTrigger id="mail-content-appearance">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="dark">{t('dark_view')}</SelectItem>
            <SelectItem value="original">{t('original_view')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
