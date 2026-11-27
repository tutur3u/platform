const POOLS = {
  'Gemini Models': 'gemini',
  'Claude and GPT models': '3p',
} as const;

interface AntigravityUsageWindow {
  id: string;
  kind: 'weekly' | 'session';
  label: string;
  usedPercent: number;
  resetsAt: string;
  windowDurationMins: number;
}

export function parseAntigravityUsage(tsv: string) {
  const windows = new Map<string, AntigravityUsageWindow>();
  const seen = new Set<string>();
  for (const line of tsv.split(/\r?\n/)) {
    const [label, limit, percent, reset, ...extra] = line
      .split('\t')
      .map((column) => column.trim());
    if (label !== 'Gemini Models' && label !== 'Claude and GPT models')
      continue;
    const kind =
      limit === 'Weekly Limit Remaining'
        ? 'weekly'
        : limit === 'Five Hour Limit Remaining'
          ? 'session'
          : undefined;
    if (!kind) continue;
    const id = `${POOLS[label]}-${kind === 'weekly' ? 'weekly' : '5h'}`;
    if (seen.has(id)) throw new Error('antigravity-usage-duplicate-window');
    seen.add(id);
    if (percent === 'disabled' && !reset && !extra.length) continue;
    const resetValue = reset?.replace(/^reset\s+/i, '');
    const resetTime = Date.parse(resetValue ?? '');
    const remainingPercent = Number(percent?.slice(0, -1));
    if (
      extra.length ||
      !percent ||
      !/^\d{1,3}(?:\.\d+)?%$/.test(percent) ||
      remainingPercent > 100 ||
      !Number.isFinite(resetTime) ||
      resetTime < 0 ||
      (resetTime === 0 && remainingPercent !== 100)
    ) {
      throw new Error('antigravity-usage-invalid-row');
    }
    windows.set(id, {
      id,
      kind,
      label: `${label} · ${limit}`,
      usedPercent: 100 - remainingPercent,
      resetsAt: new Date(resetTime).toISOString(),
      windowDurationMins: kind === 'weekly' ? 10080 : 300,
    });
  }
  if (!windows.has('gemini-weekly') || !windows.has('3p-weekly'))
    throw new Error('antigravity-usage-incomplete');
  return [...windows.values()];
}
