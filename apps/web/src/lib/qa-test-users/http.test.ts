import { afterEach, describe, expect, it, vi } from 'vitest';
import { qaErrorResponse } from './http';
import { QaStoreError } from './store';

describe('qaErrorResponse', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('maps a ledger refusal to its status without logging', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = qaErrorResponse(
      new QaStoreError('Request refused', 409, '23505'),
      'create'
    );
    expect(response.status).toBe(409);
    expect(error).not.toHaveBeenCalled();
  });

  it('logs only the fixed error code for an opaque 503', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const response = qaErrorResponse(
      new QaStoreError('QA test user ledger unavailable', 503, 'PGRST202'),
      'list'
    );
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: 'QA test users unavailable',
    });
    expect(error).toHaveBeenCalledWith('QA test users list failed', {
      errorType: 'QaStoreError',
      code: 'PGRST202',
      invalidResult: false,
    });
  });

  it('flags a malformed ledger result', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    qaErrorResponse(
      new QaStoreError('QA test user ledger returned an invalid result', 503),
      'list'
    );
    expect(error).toHaveBeenCalledWith('QA test users list failed', {
      errorType: 'QaStoreError',
      code: null,
      invalidResult: true,
    });
  });
});
