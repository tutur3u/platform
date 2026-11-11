import { describe, expect, it, vi } from 'vitest';
import {
  createOwnershipTxtValue,
  hasOwnershipProof,
  lookupTxtRecords,
  ownershipTxtName,
} from './ownership';

function doh(answers: string[], status = 0) {
  return vi.fn(async () =>
    Response.json({
      Status: status,
      Answer: answers.map((data) => ({ type: 16, data })),
    })
  );
}

describe('ownership TXT proof', () => {
  it('creates distinct tokens that match the database check', () => {
    const a = createOwnershipTxtValue();
    const b = createOwnershipTxtValue();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^tuturuuu-domain-verification=[A-Za-z0-9_-]{32,64}$/u);
    expect(ownershipTxtName('example.com')).toBe(
      '_tuturuuu-verify.example.com'
    );
  });

  it('matches the expected value across split TXT strings', async () => {
    const value = 'tuturuuu-domain-verification=abc';
    const fetchMock = doh(['"tuturuuu-domain-verification=" "abc"']);
    expect(await hasOwnershipProof('example.com', value, fetchMock)).toBe(true);
    expect(await hasOwnershipProof('example.com', `${value}x`, fetchMock)).toBe(
      false
    );
  });

  it('reports NXDOMAIN as missing and resolver failures as unknown', async () => {
    expect(await lookupTxtRecords('x.example.com', doh([], 3))).toEqual([]);
    expect(await lookupTxtRecords('x.example.com', doh([], 2))).toBeNull();
    const broken = vi.fn(async () => {
      throw new Error('network');
    });
    expect(await hasOwnershipProof('example.com', 'v', broken)).toBeNull();
  });
});
