import { DAY } from './maintenance';
import { snapshotSchema } from './schema';

export const EXPORT_SECTIONS = [
  'snapshot',
  'events',
  'needs_you',
  'decisions',
  'metrics',
  'observability_snapshot',
] as const;
export function exportPage(
  sql: SqlStorage,
  section: string,
  after: number,
  now: number,
  expired = false
) {
  if (!EXPORT_SECTIONS.some((name) => name === section))
    throw new Error('Invalid section');
  if (expired)
    return { section, rows: [], nextAfter: null, sections: EXPORT_SECTIONS };
  const predicate =
    section === 'events'
      ? `AND ts > ${now - 30 * DAY}`
      : section === 'needs_you'
        ? `AND (completedAt IS NULL OR completedAt > ${now - 30 * DAY})`
        : section === 'decisions'
          ? `AND at > ${now - 30 * DAY}`
          : section === 'metrics'
            ? `AND ((series='quota_series' AND t>${now - 7 * DAY}) OR (series!='quota_series' AND t>${now - 30 * DAY}))`
            : section === 'observability_snapshot'
              ? `AND at > ${now - 30 * DAY}`
              : '';
  const rows = sql
    .exec<{ cursor: number; data: string; kind: string | null }>(
      `SELECT rowid AS cursor,data,${section === 'metrics' ? 'series' : 'NULL'} AS kind FROM ${section}
    WHERE rowid > ? ${predicate} ORDER BY rowid LIMIT 200`,
      after
    )
    .toArray();
  return {
    section,
    rows: rows.map((row) => ({
      cursor: row.cursor,
      ...(row.kind ? { series: row.kind } : {}),
      data:
        section === 'snapshot'
          ? { ...snapshotSchema.parse(JSON.parse(row.data)), org: undefined }
          : JSON.parse(row.data),
    })),
    nextAfter: rows.length === 200 ? (rows.at(-1)?.cursor ?? null) : null,
    sections: EXPORT_SECTIONS,
  };
}
