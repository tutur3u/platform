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

function formatBytes(value: number | null) {
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

function getCapabilityRows(
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
  const freeMemory = formatBytes(asNumber(memory.freeBytes));
  const totalMemory = formatBytes(asNumber(memory.totalBytes));
  const memoryText = combine(
    freeMemory,
    freeMemory ? t('capabilities.free') : null,
    freeMemory && totalMemory ? '/' : null,
    totalMemory
  );
  const cpuText = combine(
    asNumber(cpu.cores) === null
      ? null
      : `${asNumber(cpu.cores)} ${t('capabilities.cores')}`,
    asString(cpu.model)
  );

  return [
    {
      label: t('capabilities.cli'),
      value: combine(asString(cli.name), asString(cli.version)),
    },
    {
      label: t('capabilities.bun'),
      value: asString(runtimes.bun),
    },
    {
      label: t('capabilities.node'),
      value: asString(runtimes.node),
    },
    {
      label: t('capabilities.docker'),
      value: asString(tools.docker),
    },
    {
      label: t('capabilities.git'),
      value: asString(tools.git),
    },
    {
      label: t('capabilities.os'),
      value: combine(
        asString(os.type) ?? asString(os.platform),
        asString(os.release),
        asString(os.arch)
      ),
    },
    {
      label: t('capabilities.cpu'),
      value: cpuText,
    },
    {
      label: t('capabilities.ram'),
      value: memoryText,
    },
    {
      label: t('capabilities.load'),
      value: formatLoadAverage(resources.loadAverage),
    },
    {
      label: t('capabilities.uptime'),
      value: formatUptime(asNumber(resources.uptimeSeconds)),
    },
  ].filter((row) => row.value);
}

export function RunnerCapabilitiesCell({
  capabilities,
  t,
}: {
  capabilities: DevboxAdminRunner['capabilities'];
  t: DevboxControlTranslator;
}) {
  const rows = getCapabilityRows(capabilities, t);

  if (rows.length === 0) {
    return (
      <Badge className="whitespace-nowrap" variant="outline">
        {t('capabilities.unreported')}
      </Badge>
    );
  }

  return (
    <div className="min-w-72 space-y-1 text-xs">
      {rows.map((row) => (
        <div
          className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2"
          key={row.label}
        >
          <span className="text-muted-foreground">{row.label}</span>
          <span className="truncate font-mono" title={row.value ?? undefined}>
            {row.value}
          </span>
        </div>
      ))}
    </div>
  );
}
