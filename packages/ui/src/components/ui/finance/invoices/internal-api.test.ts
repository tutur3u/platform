import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getWorkspaceUserWithInternalApi,
  listInvoiceProductsWithInternalApi,
  listMultiGroupProductsWithInternalApi,
  listUserGroupsWithInternalApi,
  listWorkspaceUsersWithInternalApi,
} from './internal-api';

const mocks = vi.hoisted(() => ({ json: vi.fn() }));
vi.mock('@tuturuuu/internal-api/client', () => ({
  encodePathSegment: encodeURIComponent,
  getInternalApiClient: () => ({ json: mocks.json }),
}));

beforeEach(() => {
  mocks.json.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe('invoice product loading', () => {
  it('loads every product page and shares one deadline across pages', async () => {
    const firstPage = Array.from({ length: 500 }, (_, id) => ({
      id: String(id),
    }));
    mocks.json
      .mockResolvedValueOnce({ data: firstPage, count: 501 })
      .mockResolvedValueOnce({ data: [{ id: 'last' }], count: 501 });

    const result = await listInvoiceProductsWithInternalApi('ws-1');

    expect(result).toEqual([...firstPage, { id: 'last' }]);
    expect(mocks.json).toHaveBeenCalledTimes(2);
    expect(mocks.json.mock.calls.map((call) => call[1].query.page)).toEqual([
      1, 2,
    ]);
    expect(mocks.json.mock.calls[0]?.[1].signal).toBe(
      mocks.json.mock.calls[1]?.[1].signal
    );
  });

  it('accepts an empty catalog', async () => {
    mocks.json.mockResolvedValue({ data: [], count: 0 });
    await expect(listInvoiceProductsWithInternalApi('ws-1')).resolves.toEqual(
      []
    );
    expect(mocks.json).toHaveBeenCalledTimes(1);
  });

  it('fails instead of looping forever when an empty page retains a total', async () => {
    mocks.json
      .mockResolvedValueOnce({ data: [{ id: 'first' }], count: 2 })
      .mockResolvedValueOnce({ data: [], count: 2 })
      .mockRejectedValue(new Error('Unexpected extra page'));

    await expect(listInvoiceProductsWithInternalApi('ws-1')).rejects.toThrow(
      'stopped making progress'
    );
    expect(mocks.json).toHaveBeenCalledTimes(2);
  });

  it('fails when the server repeats a page without adding products', async () => {
    mocks.json.mockResolvedValue({ data: [{ id: 'same' }], count: 3 });
    await expect(listInvoiceProductsWithInternalApi('ws-1')).rejects.toThrow(
      'stopped making progress'
    );
    expect(mocks.json).toHaveBeenCalledTimes(2);
  });

  it('does not return a partial catalog when a later page fails', async () => {
    mocks.json
      .mockResolvedValueOnce({ data: [{ id: 'first' }], count: 2 })
      .mockRejectedValueOnce(new Error('Unavailable'));
    await expect(listInvoiceProductsWithInternalApi('ws-1')).rejects.toThrow(
      'Unavailable'
    );
  });

  it('stops when the catalog shrinks between pages', async () => {
    mocks.json
      .mockResolvedValueOnce({ data: [{ id: 'first' }], count: 2 })
      .mockResolvedValueOnce({ data: [], count: 1 });
    await expect(listInvoiceProductsWithInternalApi('ws-1')).resolves.toEqual([
      { id: 'first' },
    ]);
  });
});

describe('invoice startup request deadlines', () => {
  it.each([
    ['products', () => listInvoiceProductsWithInternalApi('ws-1')],
    ['customers', () => listWorkspaceUsersWithInternalApi('ws-1')],
    [
      'selected customer',
      () => getWorkspaceUserWithInternalApi('ws-1', 'user-1'),
    ],
    ['customer groups', () => listUserGroupsWithInternalApi('ws-1', 'user-1')],
    [
      'group products',
      () => listMultiGroupProductsWithInternalApi('ws-1', ['group-1']),
    ],
  ])('aborts a stalled %s read', async (_name, load) => {
    const controller = new AbortController();
    const timeout = vi
      .spyOn(AbortSignal, 'timeout')
      .mockReturnValue(controller.signal);
    mocks.json.mockImplementation(
      (_path, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () =>
            reject(options.signal.reason)
          );
        })
    );

    const pending = load();
    const assertion = expect(pending).rejects.toThrow('Timed out');
    controller.abort(new Error('Timed out'));
    await assertion;
    expect(timeout).toHaveBeenCalledWith(15_000);
  });
});
