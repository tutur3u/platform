import { describe, expect, it } from 'vitest';
import {
  getFinancePagination,
  paginateFinanceArray,
} from './finance-pagination';

describe('finance pagination', () => {
  it('normalizes page and page-size flags', () => {
    expect(
      getFinancePagination({
        page: '3',
        'page-size': '10',
      })
    ).toEqual({
      limit: 10,
      offset: 20,
      page: 3,
      pageSize: 10,
    });
  });

  it('supports limit and offset aliases for array-backed finance lists', () => {
    const response = paginateFinanceArray(
      [{ id: 'wallet-1' }, { id: 'wallet-2' }, { id: 'wallet-3' }],
      {
        limit: '1',
        offset: '1',
      }
    );

    expect(response).toEqual({
      count: 3,
      data: [{ id: 'wallet-2' }],
      pagination: {
        hasNextPage: true,
        hasPreviousPage: true,
        limit: 1,
        offset: 1,
        page: 2,
        pageCount: 3,
        pageSize: 1,
        total: 3,
      },
    });
  });
});
