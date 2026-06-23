import bundledTimezones from '@tuturuuu/utils/timezones';
import type {
  TimezoneManagementMetadata,
  TimezoneManagementRecord,
  TimezoneManagementRow,
  TimezoneMutationPayload,
  TimezoneMutationResult,
  TimezoneStatusFilter,
} from './types';

export const DEFAULT_TIMEZONE_CATALOG =
  bundledTimezones as TimezoneManagementRecord[];

export function normalizeUtc(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }

  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function normalizeOffset(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) return parsed;
  }

  return 0;
}

export function normalizeTimezoneRow(
  row: TimezoneManagementRecord
): TimezoneManagementRow {
  return {
    ...row,
    abbr: row.abbr ?? '',
    created_at: row.created_at ?? null,
    id: row.id ?? null,
    isdst: row.isdst ?? false,
    offset: normalizeOffset(row.offset),
    source: 'persisted',
    status: row.status,
    text: row.text ?? '',
    utc: normalizeUtc(row.utc),
    value: row.value,
  };
}

export function normalizeTimezoneRows(rows: TimezoneManagementRecord[] = []) {
  return rows
    .filter((row) => typeof row.value === 'string' && row.value.length > 0)
    .map(normalizeTimezoneRow);
}

export function mergeTimezoneRows({
  catalogRows = DEFAULT_TIMEZONE_CATALOG,
  persistedRows,
}: {
  catalogRows?: TimezoneManagementRecord[];
  persistedRows: TimezoneManagementRecord[];
}): TimezoneManagementRow[] {
  const normalizedPersistedRows = normalizeTimezoneRows(persistedRows);
  const persistedByValue = new Map(
    normalizedPersistedRows.map((row) => [row.value, row])
  );
  const mergedValues = new Set<string>();

  const catalog = normalizeTimezoneRows(catalogRows).map((catalogRow) => {
    const persistedRow = persistedByValue.get(catalogRow.value);
    mergedValues.add(catalogRow.value);

    if (!persistedRow) {
      return {
        ...catalogRow,
        source: 'catalog' as const,
        status: catalogRow.status ?? 'outdated',
      };
    }

    return {
      ...persistedRow,
      ...catalogRow,
      created_at: persistedRow.created_at,
      hours: persistedRow.hours ?? catalogRow.hours,
      id: persistedRow.id,
      priority: persistedRow.priority ?? catalogRow.priority,
      source: 'catalog' as const,
      status: persistedRow.status ?? 'synced',
    };
  });

  const customRows = normalizedPersistedRows
    .filter((row) => !mergedValues.has(row.value))
    .map((row) => ({
      ...row,
      source: 'persisted' as const,
      status: row.status ?? 'synced',
    }));

  return [...catalog, ...customRows];
}

export function formatTimezoneOffset(offset: number) {
  const safeOffset = Number.isFinite(offset) ? offset : 0;
  const sign = safeOffset >= 0 ? '+' : '-';
  const absolute = Math.abs(safeOffset);
  const hours = Math.floor(absolute);
  const minutes = Math.round((absolute - hours) * 60);

  return `UTC${sign}${hours.toString().padStart(2, '0')}:${minutes
    .toString()
    .padStart(2, '0')}`;
}

export function formatTimezoneMetadata(
  value: TimezoneManagementMetadata
): string {
  if (value == null || value === '') return '-';
  if (Array.isArray(value)) return value.join(', ') || '-';
  if (typeof value === 'object') return JSON.stringify(value);

  return String(value);
}

export function formatTimezoneDate(value: string | null | undefined) {
  if (!value) return '-';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'short',
    hour12: false,
    timeStyle: 'medium',
  }).format(date);
}

export function toTimezoneMutationPayload(
  row: TimezoneManagementRecord
): TimezoneMutationPayload {
  return {
    abbr: row.abbr ?? '',
    hours: row.hours,
    id: row.id ?? null,
    isdst: row.isdst ?? false,
    offset: normalizeOffset(row.offset),
    priority: row.priority,
    status: row.status,
    text: row.text ?? '',
    utc: normalizeUtc(row.utc),
    value: row.value,
  };
}

export function parseTimezoneMetadataInput(
  value: string | undefined
): TimezoneManagementMetadata {
  const normalized = value?.trim();

  return normalized ? normalized : undefined;
}

export function filterTimezoneRows({
  query,
  rows,
  status,
}: {
  query: string;
  rows: TimezoneManagementRow[];
  status: TimezoneStatusFilter;
}) {
  const normalizedQuery = query.trim().toLowerCase();

  return rows.filter((row) => {
    if (status !== 'all' && row.status !== status) return false;
    if (!normalizedQuery) return true;

    const searchable = [
      row.id,
      row.value,
      row.abbr,
      row.text,
      row.status,
      row.utc.join(' '),
      formatTimezoneMetadata(row.hours),
      formatTimezoneMetadata(row.priority),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return searchable.includes(normalizedQuery);
  });
}

export function upsertPersistedTimezoneRow({
  currentRows,
  fallbackStatus,
  payload,
  result,
}: {
  currentRows: TimezoneManagementRecord[];
  fallbackStatus: TimezoneManagementRow['status'];
  payload: TimezoneMutationPayload;
  result: TimezoneMutationResult;
}) {
  const nextRow = normalizeTimezoneRow({
    ...payload,
    ...(result ?? {}),
    status: result?.status ?? payload.status ?? fallbackStatus,
  });
  let replaced = false;

  const rows = currentRows.map((row) => {
    const sameId = Boolean(nextRow.id && row.id === nextRow.id);
    const sameValue = row.value === nextRow.value;

    if (!sameId && !sameValue) return row;

    replaced = true;

    return {
      ...row,
      ...nextRow,
    };
  });

  if (!replaced) rows.push(nextRow);

  return rows;
}

export function removePersistedTimezoneRow({
  currentRows,
  id,
  value,
}: {
  currentRows: TimezoneManagementRecord[];
  id: string;
  value: string;
}) {
  return currentRows.filter((row) => row.id !== id && row.value !== value);
}
