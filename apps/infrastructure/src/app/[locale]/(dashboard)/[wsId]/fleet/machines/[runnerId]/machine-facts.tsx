import type { MachineView } from '@/lib/fleet/fleet-view';
import {
  ageSince,
  formatAge,
  formatDurationSeconds,
  formatGiB,
  formatUtcTime,
} from '@/lib/fleet/format';
import type { FleetTranslator } from '../../_components/fleet-data';

const ISOLATION_KEYS = new Set([
  'dedicatedDockerSocket',
  'dedicatedUser',
  'gvisorDefault',
  'noGeneralDockerGroup',
  'privateTokenDirectory',
  'protectedService',
]);

interface FactsContext {
  locale: string;
  now: Date;
  t: FleetTranslator;
}

function FactList({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
      {rows.map(([label, value]) => (
        <div className="contents" key={label}>
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="min-w-0 break-words font-mono text-xs leading-5">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function MachineIdentityFacts({
  locale,
  machine,
  now,
  t,
}: FactsContext & { machine: MachineView }) {
  const { telemetry } = machine;
  const missing = t('facts.not_reported');
  const enabled = Object.entries(machine.features)
    .filter(([, on]) => on)
    .map(([feature]) => feature);
  const heartbeatAge = formatAge(machine.status.heartbeatAgeMs, locale);
  const reportedAge = formatAge(ageSince(telemetry.reportedAt, now), locale);
  const runtimes = [
    telemetry.runtimes.bun && `bun ${telemetry.runtimes.bun}`,
    telemetry.runtimes.node && `node ${telemetry.runtimes.node}`,
  ].filter(Boolean);

  return (
    <FactList
      rows={[
        [t('facts.hostname'), telemetry.hostname ?? missing],
        [
          t('facts.platform'),
          [telemetry.platform, telemetry.arch].filter(Boolean).join(' · ') ||
            missing,
        ],
        [
          t('facts.cpu'),
          [telemetry.cpuCores && `${telemetry.cpuCores}×`, telemetry.cpuModel]
            .filter(Boolean)
            .join(' ') || missing,
        ],
        [t('facts.memory'), formatGiB(telemetry.memoryTotalBytes) ?? missing],
        [t('facts.cli'), telemetry.cliVersion ?? missing],
        [t('facts.runtimes'), runtimes.join(', ') || missing],
        [t('facts.execution_mode'), telemetry.executionMode ?? missing],
        [
          t('facts.commit_run'),
          telemetry.commitRunProtocols.length
            ? telemetry.commitRunProtocols.map((v) => `v${v}`).join(', ')
            : missing,
        ],
        [t('facts.features'), enabled.join(', ') || t('facts.none')],
        [
          t('facts.credential'),
          t('facts.credential_value', {
            active: machine.tokens.active,
            total: machine.tokens.total,
          }),
        ],
        [
          t('facts.heartbeat'),
          machine.lastHeartbeatAt
            ? `${formatUtcTime(machine.lastHeartbeatAt, locale)} (${heartbeatAge})`
            : t('facts.never'),
        ],
        [
          t('facts.reported'),
          telemetry.reportedAt && reportedAge
            ? `${formatUtcTime(telemetry.reportedAt, locale)} (${reportedAge})`
            : missing,
        ],
        [
          t('facts.uptime'),
          formatDurationSeconds(telemetry.uptimeSeconds) ?? missing,
        ],
        [
          t('facts.registered'),
          formatUtcTime(machine.runner.created_at, locale),
        ],
      ]}
    />
  );
}

export function MachineIsolationFacts({
  machine,
  t,
}: {
  machine: MachineView;
  t: FleetTranslator;
}) {
  const entries = Object.entries(machine.telemetry.isolation);
  if (entries.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        {t('isolation.not_attested')}
      </p>
    );
  }

  return (
    <FactList
      rows={entries.map(([key, value]) => [
        ISOLATION_KEYS.has(key) ? t(`isolation.keys.${key}`) : key,
        value ? t('isolation.yes') : t('isolation.no'),
      ])}
    />
  );
}
