import type { FleetDigest } from '@tuturuuu/internal-api/fleet';
import { Badge } from '@tuturuuu/ui/badge';
import { toneBadge } from '../components/tone';
import { DigestSection } from './digest-section';
import { type LaneState, laneTone } from './model';
import { ReadMessage, readState, UnavailableTab } from './query-message';
import { useFleetDigest } from './queries';
import { useFleetText } from './text';

export function StatusTab() {
  const { t } = useFleetText();
  const state = readState(useFleetDigest());
  if (state.kind !== 'ready') return <ReadMessage state={state} />;
  const { sections, totals } = state.data;
  if (sections.length === 0) {
    return <UnavailableTab>{t.status.empty}</UnavailableTab>;
  }
  return (
    <>
      <Totals totals={totals} />
      {sections.map((section) => (
        <DigestSection key={section.projectKey} section={section} />
      ))}
    </>
  );
}

function Totals({ totals }: { totals: FleetDigest['totals'] }) {
  const { t } = useFleetText();
  const states = (
    Object.entries(totals.byState) as [LaneState, number][]
  ).filter(([, count]) => count > 0);
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
      <dl className="flex gap-6">
        <Total label={t.status.projects} value={totals.projects} />
        <Total label={t.status.lanes} value={totals.lanes} />
      </dl>
      {states.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {states.map(([state, count]) => (
            <Badge
              key={state}
              variant="outline"
              className={toneBadge(laneTone[state])}
            >
              {t.laneState[state]} {count}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

function Total({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="font-semibold text-xl tabular-nums">{value}</dd>
    </div>
  );
}
