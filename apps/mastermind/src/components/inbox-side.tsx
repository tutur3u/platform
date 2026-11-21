import { Check, MessageSquare } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@tuturuuu/ui/card';
import type { InboxLanes } from '../fleet/inbox-lanes';
import type { InboxItem } from '../fleet/model';
import { formatTime, useI18n } from '../i18n';
import { toneBadge, toneDot } from './tone';

/** Updates to skim: open FYI asks and decisions closed anywhere. */
export function FyiPanel({
  lanes,
  showFyi,
}: {
  lanes: InboxLanes;
  showFyi: boolean;
}) {
  const { t, locale } = useI18n();
  const asks = showFyi ? lanes.fyi.asks : [];
  const { resolved } = lanes.fyi;
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-center gap-2 px-4 py-3">
        <CardTitle className="text-base">{t('inbox.fyi')}</CardTitle>
        <Badge variant="secondary" className="tabular-nums">
          {asks.length + resolved.length}
        </Badge>
      </CardHeader>
      {asks.length + resolved.length === 0 ? (
        <p className="border-t px-4 py-4 text-muted-foreground text-sm">
          {t('inbox.empty.fyi')}
        </p>
      ) : (
        <ul className="divide-y border-t">
          {asks.map(({ decision }) => (
            <li key={decision.id} className="flex gap-3 px-4 py-3">
              <span className={toneDot('blue', 'mt-1.5')} aria-hidden />
              <div className="min-w-0 space-y-0.5">
                <p className="font-medium text-sm">{decision.title}</p>
                <p className="text-muted-foreground text-xs">
                  {[decision.requester, formatTime(locale, decision.createdAt)]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
            </li>
          ))}
          {resolved.map((decision) => (
            <li key={decision.id} className="flex gap-3 px-4 py-3">
              <span className={toneDot('green', 'mt-1.5')} aria-hidden />
              <div className="min-w-0 space-y-1">
                <p className="font-medium text-sm">{decision.title}</p>
                <div className="flex flex-wrap items-center gap-1.5 text-muted-foreground text-xs">
                  {decision.answeredVia && (
                    <Badge variant="outline" className={toneBadge('green')}>
                      <MessageSquare />
                      {t('resolved.via', {
                        channel: t(`channel.${decision.answeredVia}`),
                      })}
                    </Badge>
                  )}
                  {[
                    decision.outcome,
                    formatTime(locale, decision.resolvedAt),
                    decision.answeredVia &&
                    decision.answeredVia !== 'mastermind'
                      ? t('resolved.closedHere')
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Answers Web recorded, with how far each got. */
export function RecentAnswers({ items }: { items: InboxItem[] }) {
  const { t, locale } = useI18n();
  if (!items.length) return null;
  return (
    <Card className="overflow-hidden">
      <CardHeader className="space-y-1 px-4 py-3">
        <CardTitle className="text-base">{t('inbox.recent')}</CardTitle>
        <CardDescription>{t('inbox.recentNote')}</CardDescription>
      </CardHeader>
      <ul className="divide-y border-t">
        {items.map(({ decision, receipt }) => {
          const option = decision.options.find(
            (o) => o.id === receipt?.optionId
          );
          return (
            <li key={decision.id} className="space-y-1.5 px-4 py-3">
              <p className="font-medium text-sm">{decision.title}</p>
              {receipt && (
                <div className="flex flex-wrap items-center gap-1.5 text-muted-foreground text-xs">
                  <Badge
                    variant="outline"
                    className={toneBadge(receipt.pickedUp ? 'green' : 'blue')}
                  >
                    {receipt.pickedUp && <Check />}
                    {receipt.pickedUp
                      ? t('delivery.received')
                      : t('delivery.sent')}
                  </Badge>
                  {[
                    option?.label ?? t(`action.${receipt.action}`),
                    formatTime(locale, receipt.answeredAt),
                  ].join(' · ')}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
