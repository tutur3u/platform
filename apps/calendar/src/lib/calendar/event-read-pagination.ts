import { z } from 'zod';

const Timestamp = z.string().datetime({ offset: true });
const Cursor = z.object({ start_at: Timestamp, id: z.guid() }).strict();
export type CalendarReadCursor = z.infer<typeof Cursor>;

/** Unpaginated calendar views remain bounded; explicit downloads read one page. */
export function parseCalendarEventRead(search: URLSearchParams) {
  const dates = z.object({ start_at: Timestamp, end_at: Timestamp }).safeParse({
    start_at: search.get('start_at'),
    end_at: search.get('end_at'),
  });
  if (!dates.success) throw new Error('Valid start and end dates are required');
  const start = new Date(dates.data.start_at);
  const end = new Date(dates.data.end_at);
  if (!Number.isFinite(+start) || !Number.isFinite(+end) || +end <= +start) {
    throw new Error('End date must be after start date');
  }
  const rawSize = search.get('page_size');
  const pageSize = rawSize === null ? undefined : Number(rawSize);
  if (
    rawSize !== null &&
    (!/^\d+$/.test(rawSize) ||
      !Number.isInteger(pageSize) ||
      pageSize! < 1 ||
      pageSize! > 500)
  ) {
    throw new Error('page_size must be an integer between 1 and 500');
  }
  if (pageSize === undefined && +end - +start > 400 * 86400000) {
    throw new Error('Unpaginated calendar ranges cannot exceed 400 days');
  }
  let cursor: CalendarReadCursor | undefined;
  const rawCursor = search.get('cursor');
  if (rawCursor !== null) {
    if (pageSize === undefined || rawCursor.length > 256) {
      throw new Error('A bounded page_size is required with cursor');
    }
    try {
      cursor = Cursor.parse(JSON.parse(rawCursor));
    } catch {
      throw new Error('Invalid calendar cursor');
    }
  }
  return {
    start_at: start.toISOString(),
    end_at: end.toISOString(),
    pageSize,
    cursor,
  };
}
