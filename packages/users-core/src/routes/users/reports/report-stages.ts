export const PERIODIC_REPORT_STAGES = [
  'draft',
  'pending',
  'approved',
  'blocked',
  'queued',
  'processing',
  'sent',
  'failed',
  'skipped',
  'rejected',
] as const;
export function normalizeReportStages(value: unknown) {
  const source =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  return Object.fromEntries(
    PERIODIC_REPORT_STAGES.map((stage) => [
      stage,
      typeof source[stage] === 'number' ? source[stage] : 0,
    ])
  ) as Record<(typeof PERIODIC_REPORT_STAGES)[number], number>;
}
