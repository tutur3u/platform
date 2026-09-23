export class IncompleteInvoiceExportError extends Error {
  constructor() {
    super(
      'Invoice export changed or returned incomplete data. Retry the export.'
    );
    this.name = 'IncompleteInvoiceExportError';
  }
}

/** Never turn truncated, overlapping, or changing pages into a successful file. */
export async function collectInvoiceExport<T>({
  fetchPage,
  getKey,
  onProgress,
  pageSize = 1000,
}: {
  fetchPage: (
    page: number,
    pageSize: number
  ) => Promise<{
    data: T[];
    count: number;
  }>;
  getKey: (row: T) => string;
  onProgress?: (progress: number) => void;
  pageSize?: number;
}): Promise<T[]> {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1) {
    throw new RangeError('Invalid export page size');
  }

  const rows: T[] = [];
  const keys = new Set<string>();
  let expectedCount: number | undefined;

  for (let page = 1; ; page++) {
    const result = await fetchPage(page, pageSize);
    if (
      !result ||
      !Array.isArray(result.data) ||
      !Number.isSafeInteger(result.count) ||
      result.count < 0 ||
      (expectedCount !== undefined && result.count !== expectedCount)
    ) {
      throw new IncompleteInvoiceExportError();
    }
    expectedCount = result.count;

    const expectedLength = Math.min(pageSize, expectedCount - rows.length);
    if (result.data.length !== expectedLength) {
      throw new IncompleteInvoiceExportError();
    }

    for (const row of result.data) {
      const key = getKey(row);
      if (!key || keys.has(key)) throw new IncompleteInvoiceExportError();
      keys.add(key);
      rows.push(row);
    }

    onProgress?.(
      expectedCount === 0 ? 100 : (rows.length / expectedCount) * 100
    );
    if (rows.length === expectedCount) return rows;
  }
}
