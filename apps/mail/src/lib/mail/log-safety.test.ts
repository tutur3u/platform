import { describe, expect, it } from 'vitest';
import { safeErrorFields, safeLogWorkspaceId } from './log-safety';

const address = 'person@example.com';
const addressPattern = /[\w.+-]+@[\w-]+\.[\w.]+/u;

describe('safeErrorFields', () => {
  it.each([
    {
      label: 'PostgREST errors',
      input: {
        code: '23505',
        message: 'Duplicate ' + address,
        details: 'Key (address)=(' + address + ') already exists',
        hint: 'Check ' + address,
      },
      expected: { code: '23505' },
    },
    {
      label: 'Error instances',
      input: new TypeError('Invalid ' + address, {
        cause: { name: address, message: address, code: 'SECRET' },
      }),
      expected: { name: 'TypeError' },
    },
    {
      label: 'provider errors',
      input: {
        name: 'ProviderError',
        code: 429,
        statusCode: 503,
        body: { recipient: address },
        response: { body: address, status: 422 },
      },
      expected: { name: 'ProviderError', code: 429, status: 503 },
    },
    {
      label: 'nested values and non-token fields',
      input: {
        name: address,
        code: { code: 'NESTED', detail: address },
        status: '500',
        cause: { name: 'NestedError', status: 500 },
      },
      expected: {},
    },
    { label: 'plain text failures', input: address, expected: {} },
  ])('keeps only safe fields from $label', ({ input, expected }) => {
    const result = safeErrorFields(input);
    expect(result).toEqual(expected);
    expect(JSON.stringify(result)).not.toContain('@');
    expect(JSON.stringify(result)).not.toMatch(addressPattern);
  });

  it('enforces token character and length limits', () => {
    const name = 'E_-.'.repeat(15);
    const code = 'c_-.'.repeat(10);
    expect(safeErrorFields({ name, code })).toEqual({ name, code });
    expect(safeErrorFields({ name: name + 'E', code: code + 'c' })).toEqual({});
    expect(safeErrorFields({ name: 'Error\n', code: address })).toEqual({});
  });

  it('uses a finite numeric status and prefers status over statusCode', () => {
    expect(safeErrorFields({ status: 400, statusCode: 503 })).toEqual({
      status: 400,
    });
    expect(safeErrorFields({ status: Infinity, statusCode: 503 })).toEqual({
      status: 503,
    });
    expect(safeErrorFields({ code: NaN, status: NaN })).toEqual({});
  });

  it('handles errors with throwing accessors', () => {
    expect(
      safeErrorFields({
        get name() {
          throw new Error(address);
        },
      })
    ).toEqual({});
  });
});

describe('safeLogWorkspaceId', () => {
  it('keeps persisted workspace IDs and drops arbitrary route values', () => {
    const workspaceId = '12345678-1234-1234-1234-123456789abc';
    expect(safeLogWorkspaceId(workspaceId)).toBe(workspaceId);
    expect(safeLogWorkspaceId(address)).toBeUndefined();
    expect(safeLogWorkspaceId(workspaceId + '\n')).toBeUndefined();
  });
});
