export const EXTERNAL_PROJECT_QUERY_PAGE_SIZE = 1000;

export type ExternalProjectPageResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

/**
 * Reads every row of a ranged query, one page at a time, so a workspace past
 * the API's default row limit is not silently truncated.
 */
export async function fetchAllExternalProjectRows<T>(
  loadPage: (
    from: number,
    to: number
  ) => PromiseLike<ExternalProjectPageResult<T>>
) {
  const rows: T[] = [];

  for (let from = 0; ; from += EXTERNAL_PROJECT_QUERY_PAGE_SIZE) {
    const { data, error } = await loadPage(
      from,
      from + EXTERNAL_PROJECT_QUERY_PAGE_SIZE - 1
    );

    if (error) {
      throw new Error(error.message);
    }

    const page = data ?? [];
    rows.push(...page);

    if (page.length < EXTERNAL_PROJECT_QUERY_PAGE_SIZE) {
      return rows;
    }
  }
}

/**
 * Reads every row of a query in id order, keyed on the last id seen rather
 * than an offset, so a row deleted between pages cannot shift a row that
 * exists throughout the read past the page boundary.
 */
export async function fetchAllExternalProjectRowsById<T extends { id: string }>(
  loadPage: (
    afterId: string | null,
    limit: number
  ) => PromiseLike<ExternalProjectPageResult<T>>
) {
  const rows: T[] = [];
  let afterId: string | null = null;

  for (;;) {
    const { data, error } = await loadPage(
      afterId,
      EXTERNAL_PROJECT_QUERY_PAGE_SIZE
    );

    if (error) {
      throw new Error(error.message);
    }

    const page = data ?? [];
    rows.push(...page);

    const last = page.at(-1);
    if (page.length < EXTERNAL_PROJECT_QUERY_PAGE_SIZE || !last) {
      return rows;
    }
    afterId = last.id;
  }
}
