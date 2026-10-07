import {
  listTutoringSessions,
  listTutoringTeachers,
} from '@tuturuuu/internal-api/tutoring';

interface Page<T> {
  data: T[];
  count: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** Bounded complete reads: partial pagination is an exception, never free time. */
export async function completeTutoringPages<T extends { id: string }>(
  read: (page: number) => Promise<Page<T>>,
  current: () => boolean
): Promise<T[]> {
  const rows = new Map<string, T>();
  let expectedCount: number | undefined;
  let expectedPages: number | undefined;
  for (let page = 1; page <= 20; page++) {
    if (!current()) throw new Error('Scope expired');
    const response = await read(page);
    if (!current()) throw new Error('Scope expired');
    if (
      !Number.isSafeInteger(response.count) ||
      response.count < 0 ||
      response.count > 2000 ||
      response.page !== page ||
      response.pageSize !== 100 ||
      response.totalPages !== Math.ceil(response.count / 100) ||
      (expectedCount !== undefined && response.count !== expectedCount) ||
      (expectedPages !== undefined && response.totalPages !== expectedPages) ||
      response.data.length !==
        Math.min(100, Math.max(0, response.count - (page - 1) * 100))
    )
      throw new Error('Incomplete planning data');
    expectedCount = response.count;
    expectedPages = response.totalPages;
    for (const row of response.data) {
      if (!row.id || rows.has(row.id))
        throw new Error('Incomplete planning data');
      rows.set(row.id, row);
    }
    if (page >= response.totalPages) {
      if (rows.size !== response.count)
        throw new Error('Incomplete planning data');
      return [...rows.values()];
    }
  }
  throw new Error('Planning data exceeds limit');
}

export async function loadTutoringPlanData(
  wsId: string,
  fromDate: string,
  toDate: string,
  current: () => boolean
) {
  const teachers = await completeTutoringPages(
    (page) => listTutoringTeachers(wsId, { page, pageSize: 100 }),
    current
  );
  const sessions = await completeTutoringPages(
    (page) =>
      listTutoringSessions(wsId, {
        page,
        pageSize: 100,
        fromDate,
        toDate,
        sortOrder: 'asc',
      }),
    current
  );
  return { teachers, sessions };
}
