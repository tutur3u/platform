import { Label } from '@tuturuuu/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { useTranslations } from 'next-intl';
import { useId, useSyncExternalStore } from 'react';
import { SettingItemTab } from '../../../../../ui/src/components/ui/custom/settings-item-tab';
import type { MediaPolicy, SmallModePreference } from '../lib/media-policy';

const PREFERENCES: SmallModePreference[] = ['auto', 'on', 'off'];

/** Thumbnail mode: send and receive non-spotlit cameras at low resolution. */
export function ThumbnailModeSetting({ policy }: { policy?: MediaPolicy }) {
  const t = useTranslations('meet.call');
  const id = useId();
  const smallModePreference = useSyncExternalStore(
    policy?.subscribe ?? noSubscribe,
    () => policy?.getSnapshot().smallModePreference ?? 'auto',
    () => 'auto' as const
  );
  if (!policy) return null;
  return (
    <SettingItemTab
      title={<Label htmlFor={id}>{t('thumbnail_mode')}</Label>}
      description={t('thumbnail_mode_hint')}
      controlWidth="sm"
    >
      <Select
        value={smallModePreference}
        onValueChange={(value) => {
          const next = PREFERENCES.find((entry) => entry === value);
          if (next) policy.setSmallModePreference(next);
        }}
      >
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="auto">{t('thumbnail_mode_auto')}</SelectItem>
          <SelectItem value="on">{t('thumbnail_mode_on')}</SelectItem>
          <SelectItem value="off">{t('thumbnail_mode_off')}</SelectItem>
        </SelectContent>
      </Select>
    </SettingItemTab>
  );
}

const noSubscribe = () => () => undefined;
