import { Card } from '@tuturuuu/ui/card';
import { Switch } from '@tuturuuu/ui/switch';
import { useI18n } from '../i18n';
import { Section } from './section';

export function SettingsSection({
  showFyi,
  onShowFyi,
}: {
  showFyi: boolean;
  onShowFyi: (value: boolean) => void;
}) {
  const { t } = useI18n();
  return (
    <Section id="settings" title={t('nav.settings')}>
      <Card className="max-w-3xl divide-y">
        <div className="space-y-1 px-4 py-4 md:px-5">
          <div className="font-medium text-sm">{t('settings.push')}</div>
          <p className="text-muted-foreground text-sm">
            {t('settings.pushDetail')}
          </p>
          <p className="text-muted-foreground text-sm">
            {t('settings.manage')}
          </p>
        </div>
        <div className="flex items-center justify-between gap-4 px-4 py-4 md:px-5">
          <div className="space-y-1">
            <label htmlFor="show-fyi" className="font-medium text-sm">
              {t('settings.fyi')}
            </label>
            <p className="text-muted-foreground text-sm">
              {t('settings.fyiDetail')}
            </p>
          </div>
          <Switch id="show-fyi" checked={showFyi} onCheckedChange={onShowFyi} />
        </div>
      </Card>
    </Section>
  );
}
