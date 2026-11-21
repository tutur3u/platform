/**
 * Parses the heartbeat `capabilities` report (validated by the web heartbeat
 * route) into plain numbers. Every field is optional on the wire, so every
 * reading here may be null; callers render null as unknown.
 */

export interface MachineTelemetry {
  arch: string | null;
  cliVersion: string | null;
  commitRunProtocols: number[];
  cpuCores: number | null;
  cpuModel: string | null;
  diskFreeGiB: number | null;
  /** Bucketed to steps of 5 by the runner. */
  diskFreePercent: number | null;
  executionMode: string | null;
  hostname: string | null;
  isolation: Record<string, boolean>;
  /** One-minute load average divided by cores; can exceed 100. */
  loadPerCorePercent: number | null;
  memoryTotalBytes: number | null;
  memoryUsedBytes: number | null;
  memoryUsedPercent: number | null;
  platform: string | null;
  reportedAt: string | null;
  runtimes: { bun: string | null; node: string | null };
  uptimeSeconds: number | null;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function finite(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function percent(numerator: number, denominator: number) {
  return Math.round((numerator / denominator) * 1000) / 10;
}

export function parseMachineTelemetry(capabilities: unknown): MachineTelemetry {
  const root = record(capabilities);
  const os = record(root.os);
  const resources = record(root.resources);
  const cpu = record(resources.cpu);
  const memory = record(resources.memory);
  const disk = record(resources.disk);
  const runtimes = record(root.runtimes);
  const protocols = record(root.protocols);

  const cpuCores = finite(cpu.cores);
  const load1 = Array.isArray(resources.loadAverage)
    ? finite(resources.loadAverage[0])
    : null;
  const freeBytes = finite(memory.freeBytes);
  const totalBytes = finite(memory.totalBytes);
  const memoryUsedBytes =
    freeBytes !== null && totalBytes !== null && totalBytes > 0
      ? Math.max(totalBytes - freeBytes, 0)
      : null;
  const diskFreePercent = finite(disk.freePct);

  const isolation: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(record(root.isolation))) {
    if (typeof value === 'boolean') isolation[key] = value;
  }

  return {
    arch: text(os.arch),
    cliVersion: text(record(root.cli).version),
    commitRunProtocols: Array.isArray(protocols.commitRun)
      ? protocols.commitRun.filter(
          (entry): entry is number => typeof entry === 'number'
        )
      : [],
    cpuCores,
    cpuModel: text(cpu.model),
    diskFreeGiB: finite(disk.freeGiB),
    diskFreePercent,
    executionMode: text(root.executionMode),
    hostname: text(os.hostname),
    isolation,
    loadPerCorePercent:
      load1 !== null && cpuCores !== null && cpuCores > 0
        ? percent(load1, cpuCores)
        : null,
    memoryTotalBytes: totalBytes,
    memoryUsedBytes,
    memoryUsedPercent:
      memoryUsedBytes !== null && totalBytes
        ? percent(memoryUsedBytes, totalBytes)
        : null,
    platform: text(os.platform) ?? text(os.type),
    reportedAt: text(root.reportedAt),
    runtimes: { bun: text(runtimes.bun), node: text(runtimes.node) },
    uptimeSeconds: finite(resources.uptimeSeconds),
  };
}
