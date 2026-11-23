import type { AccountPacing, RankedInstance, UsageWindow } from './types';

function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '—';
  if (ms <= 0) return 'expired';
  const totalMinutes = Math.round(ms / 60_000);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours < 24) return mins ? `${hours}h${mins}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours ? `${days}d${remHours}h` : `${days}d`;
}

function formatPct(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value))
    return '—';
  return `${Math.round(value)}%`;
}

function formatBurn(rate: number | null | undefined): string {
  if (rate === null || rate === undefined || !Number.isFinite(rate)) return '—';
  return `${rate.toFixed(1)}%/h`;
}

function padRow(cols: string[], widths: number[]): string {
  return cols
    .map((col, i) => (i === cols.length - 1 ? col : col.padEnd(widths[i] ?? 0)))
    .join('  ');
}

function renderGrid(headers: string[], rows: string[][]): string {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? '').length))
  );
  return [
    padRow(headers, widths),
    padRow(
      widths.map((w) => '-'.repeat(w)),
      widths
    ),
    ...rows.map((r) => padRow(r, widths)),
  ].join('\n');
}

export interface StatusTableRow {
  instanceId: string;
  label: string;
  provider: string;
  state: string;
  activeCount: number | string;
  windows: UsageWindow[];
  pacing?: AccountPacing;
  providerStatus?: string;
  statusMessage?: string;
  balance?: { remaining?: number; unit?: string; exhausted?: boolean };
  neverUseModels?: string[];
  lastError?: string;
}

export function formatStatusTable(
  rows: StatusTableRow[],
  t3Error?: string
): string {
  const lines: string[] = [];
  if (t3Error) lines.push(`T3 activity unavailable: ${t3Error}`);
  const headers = [
    'SEAT',
    'PROVIDER',
    'STATE',
    'REM',
    'FLOOR',
    'RESET',
    'BURN',
    'EXHAUST',
    'SAFE',
    'LANES',
    'NOTES',
  ];
  const body = rows.map((row) => {
    const p = row.pacing;
    const activeStr = String(row.activeCount);
    const lanes = p
      ? `${activeStr}/${p.recommendedMaxConcurrentLanes}`
      : activeStr;
    const exhaust =
      p?.projectedExhaustionBeforeReset === true
        ? 'BEFORE-RST'
        : p?.projectedExhaustionBeforeReset === false
          ? 'ok'
          : '—';
    const notes: string[] = [];
    if (row.providerStatus && row.providerStatus !== 'ready')
      notes.push(`t3:${row.providerStatus}`);
    if (row.balance?.exhausted) notes.push('balance=0');
    else if (row.balance?.remaining !== undefined)
      notes.push(
        `bal=${row.balance.remaining}${row.balance.unit ? ` ${row.balance.unit}` : ''}`
      );
    if (row.provider === 'opencode') {
      const goMo = row.windows.find((w) => w.id === 'go_monthly');
      const goWk = row.windows.find((w) => w.id === 'go_weekly');
      const parts = [
        goWk?.usedPercent !== undefined
          ? `go-wk=${Math.round(100 - goWk.usedPercent)}%`
          : undefined,
        goMo?.usedPercent !== undefined
          ? `go-mo=${Math.round(100 - goMo.usedPercent)}%`
          : undefined,
        'go-only/non-private; zen=NEVER',
      ].filter(Boolean);
      notes.push(parts.join('; '));
    }
    const fableWindow = row.windows.find((w) => w.id === 'seven_day_fable');
    if (fableWindow && typeof fableWindow.usedPercent === 'number')
      notes.push(
        `fable=${Math.round(100 - fableWindow.usedPercent)}%rem(approval)`
      );
    if (row.provider === 'antigravity') {
      const argon = row.windows.find((w) => w.id === 'gemini-argon-wtu-weekly');
      const gem = row.windows.find((w) => w.id === 'gemini-weekly');
      const third = row.windows.find((w) => w.id === '3p-weekly');
      if (gem?.usedPercent !== undefined)
        notes.push(`gem-wk=${Math.round(100 - gem.usedPercent)}%`);
      if (argon?.usedPercent !== undefined) notes.push(`argon=NEVER`);
      if (third?.usedPercent !== undefined)
        notes.push(`3p-wk=${Math.round(100 - third.usedPercent)}%`);
    }
    if (row.lastError && !row.windows.length) notes.push(row.lastError);
    if (row.statusMessage && row.providerStatus === 'error')
      notes.push(row.statusMessage.slice(0, 48));

    const remLabel =
      row.state === 'UNKNOWN' &&
      p?.tightestRemainingPercent !== null &&
      p?.tightestRemainingPercent !== undefined
        ? `${formatPct(p.tightestRemainingPercent)}*`
        : formatPct(p?.tightestRemainingPercent);

    return [
      `${row.instanceId}(${row.label})`,
      row.provider,
      row.state,
      remLabel,
      formatPct(p?.effectiveGlideFloorPercent),
      formatDuration(p?.soonestMsToReset),
      formatBurn(p?.burnRatePercentPerHour),
      exhaust,
      p?.safeToAdmit ? 'yes' : 'no',
      lanes,
      notes.join('; ') || '—',
    ];
  });
  lines.push(renderGrid(headers, body));
  return lines.join('\n');
}

export function formatRecommendTable(
  ranked: RankedInstance[],
  assignments: RankedInstance[],
  taskKind: string
): string {
  const headers = [
    'RANK',
    'SEAT',
    'PROVIDER',
    'STATE',
    'SCORE',
    'SAFE',
    'LANES',
    'MODEL',
    'ACTION',
    'REASONS',
  ];
  const body = ranked.map((item, idx) => [
    String(idx + 1),
    `${item.instanceId}(${item.label})`,
    item.provider,
    item.state,
    String(Math.round(item.score)),
    item.pacing?.safeToAdmit ? 'yes' : 'no',
    item.pacing
      ? `${item.activeCount}/${item.pacing.recommendedMaxConcurrentLanes}`
      : String(item.activeCount),
    item.recommendedModel ?? '—',
    item.action,
    item.reasons
      .filter((r) => !['alias', 'task-kind'].includes(r.code))
      .map((r) => r.code)
      .slice(0, 4)
      .join(','),
  ]);
  return [
    `Task kind: ${taskKind}`,
    renderGrid(headers, body),
    `Assignments: ${assignments.map((a) => `${a.instanceId}${a.recommendedModel ? `(${a.recommendedModel})` : ''}`).join(', ') || 'none'}`,
  ].join('\n');
}
