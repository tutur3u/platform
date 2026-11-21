import { Badge } from '@tuturuuu/ui/badge';
import { Card, CardContent } from '@tuturuuu/ui/card';
import type { ReactNode } from 'react';
import type { FleetRelease } from '../fleet/contract';
import { formatTime, useI18n } from '../i18n';
import { type Tone, toneBadge } from './tone';

const PROD_TONE = {
  healthy: 'green',
  degraded: 'orange',
  down: 'red',
  unknown: 'gray',
} as const;
const MIG_TONE = {
  idle: 'gray',
  staging: 'blue',
  gated: 'blue',
  applying: 'orange',
  failed: 'red',
} as const;

function Tile({
  label,
  badge,
  tone,
  detail,
}: {
  label: string;
  badge: string;
  tone: Tone;
  detail?: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <div className="font-medium text-muted-foreground text-sm">{label}</div>
        <Badge variant="outline" className={toneBadge(tone)}>
          {badge}
        </Badge>
        {detail && (
          <div className="truncate text-muted-foreground text-xs">{detail}</div>
        )}
      </CardContent>
    </Card>
  );
}

/** Main freeze, production, migrations and incidents from `release.json`. */
export function ReleaseStrip({ release }: { release?: FleetRelease }) {
  const { t, locale } = useI18n();
  const unknown = t('fleet.unknown');
  const main = release?.main;
  const production = release?.production;
  const migrations = release?.migrations;
  const incidents = release?.incidents ?? [];
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <Tile
        label={t('fleet.main')}
        badge={
          main
            ? t(main.state === 'frozen' ? 'fleet.frozen' : 'fleet.open')
            : unknown
        }
        tone={main ? (main.state === 'frozen' ? 'orange' : 'green') : 'gray'}
        detail={[
          main?.reason,
          main?.queued ? t('fleet.queued', { n: main.queued }) : undefined,
        ]
          .filter(Boolean)
          .join(' · ')}
      />
      <Tile
        label={t('fleet.production')}
        badge={production ? t(`fleet.prod.${production.state}`) : unknown}
        tone={production ? PROD_TONE[production.state] : 'gray'}
        detail={
          production?.sha && (
            <span className="font-mono">
              {production.sha}
              {production.deployedAt &&
                ` · ${formatTime(locale, production.deployedAt)}`}
            </span>
          )
        }
      />
      <Tile
        label={t('fleet.migrations')}
        badge={
          migrations
            ? migrations.pending
              ? t('fleet.mig.pending', { n: migrations.pending })
              : t(`fleet.mig.${migrations.state}`)
            : unknown
        }
        tone={migrations ? MIG_TONE[migrations.state] : 'gray'}
        detail={
          migrations?.pending ? t(`fleet.mig.${migrations.state}`) : undefined
        }
      />
      <Tile
        label={t('fleet.incidents')}
        badge={
          !release
            ? unknown
            : incidents.length
              ? t('fleet.incidentsOpen', { n: incidents.length })
              : t('fleet.noIncidents')
        }
        tone={!release ? 'gray' : incidents.length ? 'red' : 'green'}
        detail={incidents[0]?.title}
      />
    </div>
  );
}
