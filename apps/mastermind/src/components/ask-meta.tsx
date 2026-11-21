import { Clock } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import type { FleetDecision } from '../fleet/contract';
import { formatRemaining } from '../fleet/model';
import { useI18n } from '../i18n';
import { type Tone, toneBadge } from './tone';

const URGENCY_TONE: Record<FleetDecision['urgency'], Tone> = {
  urgent: 'red',
  high: 'orange',
  normal: 'blue',
  fyi: 'gray',
};

export function Due({ deadlineAt, now }: { deadlineAt?: string; now: number }) {
  const { t } = useI18n();
  if (!deadlineAt) return null;
  const left = Date.parse(deadlineAt) - now;
  return (
    <span className="flex items-center gap-1 text-muted-foreground text-sm tabular-nums">
      <Clock className="size-3.5" />
      {left > 0
        ? t('ask.due', { time: formatRemaining(left) })
        : t('ask.overdue')}
    </span>
  );
}

/** The ask's urgency as a toned badge with its label. */
export function UrgencyBadge({
  urgency,
}: {
  urgency: FleetDecision['urgency'];
}) {
  const { t } = useI18n();
  return (
    <Badge variant="outline" className={toneBadge(URGENCY_TONE[urgency])}>
      {t(`urgency.${urgency}`)}
    </Badge>
  );
}
