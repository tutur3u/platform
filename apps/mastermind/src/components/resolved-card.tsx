import { Check } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Card, CardContent } from '@tuturuuu/ui/card';
import type { FleetResolvedDecision } from '../fleet/contract';
import { formatTime, useI18n } from '../i18n';
import { toneBadge } from './tone';

/** A decision closed elsewhere (WhatsApp, the phone, the CLI) or here. */
export function ResolvedCard({
  decision,
}: {
  decision: FleetResolvedDecision;
}) {
  const { t, locale } = useI18n();
  const time = formatTime(locale, decision.resolvedAt);
  return (
    <Card className="bg-muted/50">
      <CardContent className="space-y-1 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h4 className="min-w-0 flex-1 font-semibold text-muted-foreground">
            {decision.title}
          </h4>
          {decision.answeredVia && (
            <Badge variant="outline" className={toneBadge('green')}>
              <Check />
              {t('resolved.via', {
                channel: t(`channel.${decision.answeredVia}`),
              })}
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground text-sm">
          {decision.outcome
            ? t('resolved.at', { outcome: decision.outcome, time })
            : t('resolved.plain', { time })}
        </p>
      </CardContent>
    </Card>
  );
}
