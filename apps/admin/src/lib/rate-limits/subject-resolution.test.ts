import { describe, expect, it } from 'vitest';
import { parseRateLimitSubjectKey } from './subject-resolution';

describe('parseRateLimitSubjectKey', () => {
  it('parses workspace subject keys', () => {
    const subject = parseRateLimitSubjectKey(
      'workspace:e9e2073c-7072-4e86-a268-b6e48f541fd5',
      'workspace'
    );

    expect(subject).toMatchObject({
      kind: 'workspace',
      subjectKey: 'workspace:e9e2073c-7072-4e86-a268-b6e48f541fd5',
      workspaceId: 'e9e2073c-7072-4e86-a268-b6e48f541fd5',
    });
  });

  it('parses user plus IP write counters', () => {
    const subject = parseRateLimitSubjectKey(
      'user-ip:07bf3591-3b96-41be-abfd-6b70fefbdac8:2402:800:621f'
    );

    expect(subject).toMatchObject({
      ip: '2402:800:621f',
      kind: 'user_location',
      userId: '07bf3591-3b96-41be-abfd-6b70fefbdac8',
    });
  });

  it('parses anonymous IP counters', () => {
    const subject = parseRateLimitSubjectKey(
      'anonymous-role-ip:anon:42.117.145.161'
    );

    expect(subject).toMatchObject({
      ip: '42.117.145.161',
      kind: 'ip',
      subjectKey: 'anonymous-role-ip:anon:42.117.145.161',
    });
  });
});
