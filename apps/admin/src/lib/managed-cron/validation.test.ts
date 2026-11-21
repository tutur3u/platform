import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  collectManagedCronHeaderSecretNames,
  managedCronJobPayloadSchema,
  normalizeManagedCronDomain,
  resolveManagedCronRequestHeaders,
  validateManagedCronEndpointUrl,
} from './validation';

describe('managed cron validation', () => {
  it('normalizes public domains and rejects private hostnames', () => {
    expect(normalizeManagedCronDomain('HTTPS://Hooks.Example.COM/path')).toBe(
      'hooks.example.com'
    );

    expect(() => normalizeManagedCronDomain('localhost')).toThrow(
      'Managed cron domains must be public hostnames'
    );
    expect(() => normalizeManagedCronDomain('192.168.1.1')).toThrow(
      'Managed cron domains must be public hostnames'
    );
  });

  it('allows only HTTPS endpoints on whitelisted hostnames', () => {
    expect(
      validateManagedCronEndpointUrl('https://hooks.example.com/run#secret', [
        'example.com',
      ])
    ).toMatchObject({
      hostname: 'hooks.example.com',
      ok: true,
      url: 'https://hooks.example.com/run',
    });

    expect(
      validateManagedCronEndpointUrl('http://hooks.example.com/run', [
        'example.com',
      ])
    ).toMatchObject({
      message: 'Endpoint URL must use HTTPS.',
      ok: false,
    });

    expect(
      validateManagedCronEndpointUrl('https://hooks.not-allowed.com/run', [
        'example.com',
      ])
    ).toMatchObject({
      message: 'Endpoint hostname is not whitelisted for managed cron.',
      ok: false,
    });
  });

  it('validates header configs and resolves secret-backed headers', () => {
    const payload = managedCronJobPayloadSchema.parse({
      headers_config: [
        { name: 'Authorization', secretName: 'WEBHOOK_TOKEN' },
        { name: 'X-Static', value: 'abc' },
      ],
      name: 'Daily sync',
      schedule: '0 0 * * *',
    });

    expect(collectManagedCronHeaderSecretNames(payload.headers_config)).toEqual(
      ['WEBHOOK_TOKEN']
    );

    const headers = resolveManagedCronRequestHeaders({
      config: payload.headers_config,
      secrets: new Map([['WEBHOOK_TOKEN', 'Bearer token']]),
    });

    expect(headers.get('Authorization')).toBe('Bearer token');
    expect(headers.get('X-Static')).toBe('abc');
    expect(headers.get('User-Agent')).toBe('Tuturuuu-Managed-Cron/1.0');
  });

  it('rejects forbidden managed headers', () => {
    const result = managedCronJobPayloadSchema.safeParse({
      headers_config: [{ name: 'Host', value: 'example.com' }],
      name: 'Daily sync',
      schedule: '0 0 * * *',
    });

    expect(result.success).toBe(false);
  });
});
