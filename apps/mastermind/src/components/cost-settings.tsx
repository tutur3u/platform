import { ExternalLink } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import { Switch } from '@tuturuuu/ui/switch';
import { useI18n } from '../i18n';
import { Section, SectionMessage } from './section';

export const ADMIN_URL = 'https://tuturuuu.com/admin';

/** No spend or error-budget data reaches Mastermind; link where it lives. */
export function CostSection() {
  const { t } = useI18n();
  return (
    <Section id="cost" title={t('nav.cost')}>
      <SectionMessage>
        <div className="space-y-3">
          <p>{t('cost.empty')}</p>
          <Button asChild size="sm" variant="outline">
            <a href={ADMIN_URL} target="_blank" rel="noopener noreferrer">
              <ExternalLink />
              {t('cost.admin')}
            </a>
          </Button>
        </div>
      </SectionMessage>
    </Section>
  );
}

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
