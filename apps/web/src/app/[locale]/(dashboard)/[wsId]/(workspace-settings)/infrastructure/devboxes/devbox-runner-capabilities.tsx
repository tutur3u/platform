import { Badge } from '@tuturuuu/ui/badge';
import type { DevboxAdminRunner } from '@/lib/devboxes/admin-store';

type DevboxControlTranslator = (key: string) => string;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export interface RunnerCapabilitySummary {
  bun: string | null;
  cli: string | null;
  cpu: string | null;
  docker: string | null;
  git: string | null;
  hostname: string | null;
  load: string | null;
  memoryUsedPercent: number | null;
  node: string | null;
  os: string | null;
  ram: string | null;
  reportedAt: string | null;
  uptime: string | null;
}

export function formatCapabilityBytes(value: number | null) {
  if (value === null) return null;

  const gib = value / 1024 ** 3;
  if (gib >= 1) return `${gib.toFixed(1)} GB`;

  const mib = value / 1024 ** 2;
  return `${mib.toFixed(0)} MB`;
}

function formatUptime(value: number | null) {
  if (value === null) return null;

  const days = Math.floor(value / 86_400);
  const hours = Math.floor((value % 86_400) / 3600);
  if (days > 0) return `${days}d ${hours}h`;

  const minutes = Math.floor((value % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

function formatLoadAverage(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((entry) => asNumber(entry))
        .filter((entry): entry is number => entry !== null)
        .slice(0, 3)
        .map((entry) => entry.toFixed(2))
        .join(' / ') || null
    : null;
}

function combine(...values: (string | null)[]) {
  return values.filter(Boolean).join(' ');
}

export function getRunnerCapabilitySummary(
  capabilities: DevboxAdminRunner['capabilities'],
  t: DevboxControlTranslator
) {
  const root = asRecord(capabilities);
  const cli = asRecord(root.cli);
  const os = asRecord(root.os);
  const resources = asRecord(root.resources);
  const cpu = asRecord(resources.cpu);
  const memory = asRecord(resources.memory);
  const runtimes = asRecord(root.runtimes);
  const tools = asRecord(root.tools);
  const freeBytes = asNumber(memory.freeBytes);
  const totalBytes = asNumber(memory.totalBytes);
  const usedBytes =
    freeBytes === null || totalBytes === null
      ? null
      : Math.max(totalBytes - freeBytes, 0);
  const memoryUsedPercent =
    freeBytes === null || totalBytes === null || totalBytes <= 0
      ? null
      : Math.round(Math.min(Math.max(1 - freeBytes / totalBytes, 0), 1) * 100);
  const ramText = combine(
    formatCapabilityBytes(usedBytes),
    usedBytes !== null && totalBytes !== null ? '/' : null,
    formatCapabilityBytes(totalBytes)
  );
  const cpuText = combine(
    asNumber(cpu.cores) === null
      ? null
      : `${asNumber(cpu.cores)} ${t('capabilities.cores')}`,
    asString(cpu.model)
  );

  return {
    bun: asString(runtimes.bun),
    cli: combine(asString(cli.name), asString(cli.version)) || null,
    cpu: cpuText || null,
    docker: asString(tools.docker),
    git: asString(tools.git),
    hostname: asString(os.hostname),
    load: formatLoadAverage(resources.loadAverage),
    memoryUsedPercent,
    node: asString(runtimes.node),
    os:
      combine(
        asString(os.type) ?? asString(os.platform),
        asString(os.release),
        asString(os.arch)
      ) || null,
    ram: ramText || null,
    reportedAt: asString(root.reportedAt),
    uptime: formatUptime(asNumber(resources.uptimeSeconds)),
  } satisfies RunnerCapabilitySummary;
}

export function getRunnerCapabilityRows(
  capabilities: DevboxAdminRunner['capabilities'],
  t: DevboxControlTranslator
) {
  const summary = getRunnerCapabilitySummary(capabilities, t);

  return [
    {
      label: t('capabilities.cli'),
      value: summary.cli,
    },
    {
      label: t('capabilities.bun'),
      value: summary.bun,
    },
    {
      label: t('capabilities.node'),
      value: summary.node,
    },
    {
      label: t('capabilities.docker'),
      value: summary.docker,
    },
    {
      label: t('capabilities.git'),
      value: summary.git,
    },
    {
      label: t('capabilities.os'),
      value: summary.os,
    },
    {
      label: t('capabilities.cpu'),
      value: summary.cpu,
    },
    {
      label: t('capabilities.ram'),
      value:
        summary.ram && summary.memoryUsedPercent !== null
          ? `${summary.ram} (${summary.memoryUsedPercent}%)`
          : summary.ram,
    },
    {
      label: t('capabilities.load'),
      value: summary.load,
    },
    {
      label: t('capabilities.uptime'),
      value: summary.uptime,
    },
  ].filter((row) => row.value);
}

function VersionBadge({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  if (!value) return null;

  return (
    <Badge
      className="max-w-44 truncate font-mono text-[11px]"
      variant="outline"
    >
      {label} {value}
    </Badge>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;

  return (
    <div className="grid grid-cols-[4.25rem_minmax(0,1fr)] gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-mono" title={value}>
        {value}
      </span>
    </div>
  );
}

export function RunnerCapabilitiesCell({
  capabilities,
  t,
}: {
  capabilities: DevboxAdminRunner['capabilities'];
  t: DevboxControlTranslator;
}) {
  const summary = getRunnerCapabilitySummary(capabilities, t);
  const rows = getRunnerCapabilityRows(capabilities, t);

  if (rows.length === 0) {
    return (
      <Badge className="whitespace-nowrap" variant="outline">
        {t('capabilities.unreported')}
      </Badge>
    );
  }

  return (
    <div className="min-w-80 space-y-2 text-xs">
      <div className="flex flex-wrap gap-1">
        <VersionBadge
          label="ttr"
          value={summary.cli?.replace(/^ttr\s+/u, '') ?? null}
        />
        <VersionBadge label="bun" value={summary.bun} />
        <VersionBadge label="node" value={summary.node} />
      </div>
      <div className="grid gap-x-3 gap-y-1 sm:grid-cols-2">
        <DetailRow label={t('capabilities.host')} value={summary.hostname} />
        <DetailRow label={t('capabilities.os')} value={summary.os} />
        <DetailRow label={t('capabilities.cpu')} value={summary.cpu} />
        <DetailRow
          label={t('capabilities.ram')}
          value={
            summary.ram && summary.memoryUsedPercent !== null
              ? `${summary.ram} (${summary.memoryUsedPercent}%)`
              : summary.ram
          }
        />
        <DetailRow label={t('capabilities.load')} value={summary.load} />
        <DetailRow label={t('capabilities.docker')} value={summary.docker} />
      </div>
    </div>
  );
}
