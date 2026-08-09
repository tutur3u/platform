import { describe, expect, it } from 'vitest';
import { MAX_CRAWLER_PAGE_SIZE, parseCrawlerPagination } from './pagination';

describe('parseCrawlerPagination', () => {
  it('uses positive defaults for invalid values', () => {
    const params = new URLSearchParams({ page: '-5', pageSize: 'invalid' });

    expect(parseCrawlerPagination(params)).toEqual({ page: 1, pageSize: 20 });
  });

  it('caps caller-controlled page sizes', () => {
    const params = new URLSearchParams({ page: '2', pageSize: '1000000' });

    expect(parseCrawlerPagination(params)).toEqual({
      page: 2,
      pageSize: MAX_CRAWLER_PAGE_SIZE,
    });
  });
});
