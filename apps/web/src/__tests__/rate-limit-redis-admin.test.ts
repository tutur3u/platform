import { describe, expect, it } from 'vitest';
import { parseRateLimitBucketKey } from '../lib/infrastructure/rate-limit-redis-admin';

describe('parseRateLimitBucketKey', () => {
  it('parses base read buckets', () => {
    expect(
      parseRateLimitBucketKey(
        'proxy:web:api:users-me:authenticated:get:minute:session:abc123'
      )
    ).toEqual({
      callerClass: 'authenticated',
      key: 'proxy:web:api:users-me:authenticated:get:minute:session:abc123',
      operation: 'get',
      policy: 'users-me',
      subject: 'session:abc123',
      subjectKind: 'session',
      trustSuffix: null,
      window: 'minute',
    });
  });

  it('parses trusted mutate buckets separately from read buckets', () => {
    expect(
      parseRateLimitBucketKey(
        'proxy:web:api:default:anonymous:t3:mutate:hour:ip:1.2.3.4'
      )
    ).toEqual({
      callerClass: 'anonymous',
      key: 'proxy:web:api:default:anonymous:t3:mutate:hour:ip:1.2.3.4',
      operation: 'mutate',
      policy: 'default',
      subject: 'ip:1.2.3.4',
      subjectKind: 'ip',
      trustSuffix: 't3',
      window: 'hour',
    });
  });
});
