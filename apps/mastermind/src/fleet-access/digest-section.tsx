import type { FleetDigestSection } from '@tuturuuu/internal-api/fleet';
import { Badge } from '@tuturuuu/ui/badge';
import { SettingsSectionMessage } from '@tuturuuu/ui/custom/settings-section';
import type { ReactNode } from 'react';
import { toneBadge } from '../components/tone';
import { laneTone } from './model';
import { Panel } from './query-message';
import { fill, formatInstant, useFleetText } from './text';

type Lane = FleetDigestSection['lanes'][number];

/** One project's snapshot: its times, staleness and lanes. */
export function DigestSection({
  section,
  lanes = section.lanes,
  empty,
}: {
  section: FleetDigestSection;
  lanes?: Lane[];
  empty?: ReactNode;
}) {
  const { locale, t } = useFleetText();
  return (
    <section className="space-y-3" aria-label={section.projectKey}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold text-base tracking-tight">
          {section.projectKey}
        </h2>
        {section.stale && (
          <Badge variant="outline" className={toneBadge('yellow')}>
            {t.status.stale}
          </Badge>
        )}
      </div>
      <Panel>
        <p className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-3 text-muted-foreground text-sm md:px-5">
          <span>
            {fill(t.status.generated, {
              time: formatInstant(locale, section.generatedAt),
            })}
          </span>
          <span>
            {fill(t.status.received, {
              time: formatInstant(locale, section.receivedAt),
            })}
          </span>
        </p>
        {lanes.length === 0 ? (
          <SettingsSectionMessage>
            {empty ?? t.status.noLanes}
          </SettingsSectionMessage>
        ) : (
          <ul className="divide-y">
            {lanes.map((lane) => (
              <LaneRow key={lane.lane} lane={lane} />
            ))}
          </ul>
        )}
      </Panel>
    </section>
  );
}

function LaneRow({ lane }: { lane: Lane }) {
  const { locale, t } = useFleetText();
  const details = [
    lane.releaseTitle,
    lane.readinessItem,
    lane.eta && fill(t.status.eta, { time: formatInstant(locale, lane.eta) }),
  ].filter(Boolean);
  return (
    <li className="space-y-1.5 px-4 py-3 md:px-5">
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0 break-words font-medium text-sm">
          {lane.lane}
        </span>
        <Badge variant="outline" className={toneBadge(laneTone[lane.state])}>
          {t.laneState[lane.state]}
        </Badge>
      </div>
      {(details.length > 0 || lane.shortSha) && (
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground text-sm">
          {details.map((detail) => (
            <span key={detail} className="break-words">
              {detail}
            </span>
          ))}
          {lane.shortSha && <code className="font-mono">{lane.shortSha}</code>}
        </p>
      )}
      {lane.blockerCodes.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {lane.blockerCodes.map((code) => (
            <Badge key={code} variant="outline">
              {t.blocker[code]}
            </Badge>
          ))}
        </div>
      )}
    </li>
  );
}
