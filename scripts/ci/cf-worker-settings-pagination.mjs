import assert from 'node:assert/strict';

const MAX_PAGES = 8;
const MAX_PAGE_SIZE = 50;

/** Follow only locally constructed page URLs; never trust response links. */
export async function settingsList(request, path, display = path, field) {
  const items = [];
  const seen = new Set();
  let totalPages;
  let totalCount;
  let pageSize;
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = new URL(path, 'https://api.cloudflare.com/client/v4');
    if (page > 1) url.searchParams.set('page', String(page));
    const body = await request(`${url.pathname}${url.search}`, display);
    const fail = (condition, reason) =>
      assert.ok(condition, `settings snapshot ${reason} for GET ${display}`);
    const batch = field ? body.result?.[field] : body.result;
    const info = body.result_info ?? {};
    fail(Array.isArray(batch), 'list unavailable');
    for (const key of [
      'page',
      'per_page',
      'total_pages',
      'total_count',
      'count',
    ])
      fail(
        info[key] === undefined ||
          (Number.isSafeInteger(info[key]) && info[key] >= 0),
        'invalid pagination metadata'
      );
    fail(
      info.page === undefined ? page === 1 : info.page === page,
      'pagination did not advance'
    );
    fail(
      info.count === undefined || info.count === batch.length,
      'pagination count differs'
    );
    const size = info.per_page ?? MAX_PAGE_SIZE;
    fail(
      size > 0 && size <= MAX_PAGE_SIZE && batch.length <= size,
      'page size exceeded'
    );
    pageSize ??= size;
    fail(pageSize === size, 'pagination page size changed');
    const pages =
      info.total_pages ??
      (info.total_count === undefined
        ? undefined
        : Math.ceil(info.total_count / size));
    if (pages !== undefined) {
      fail(pages <= MAX_PAGES, 'page budget exceeded');
      totalPages ??= pages;
      fail(
        totalPages === pages &&
          (pages >= page || (page === 1 && pages === 0 && batch.length === 0)),
        'pagination totals changed'
      );
    } else fail(totalPages === undefined, 'pagination metadata disappeared');
    if (info.total_count !== undefined) {
      totalCount ??= info.total_count;
      fail(totalCount === info.total_count, 'pagination total count changed');
    } else fail(totalCount === undefined, 'pagination total count disappeared');
    const fingerprint = JSON.stringify(batch);
    fail(
      batch.length === 0 || !seen.has(fingerprint),
      'pagination repeated a page'
    );
    seen.add(fingerprint);
    items.push(...batch);
    fail(
      items.length <= MAX_PAGES * MAX_PAGE_SIZE,
      'list item budget exceeded'
    );
    if (pages === undefined ? batch.length < size : page >= pages) {
      fail(
        totalCount === undefined || items.length === totalCount,
        'pagination total count differs'
      );
      return items;
    }
    fail(batch.length > 0 && info.page === page, 'pagination cannot advance');
  }
  assert.fail(`settings snapshot page budget exceeded for GET ${display}`);
}
