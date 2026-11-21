import { describe, expect, it } from 'vitest';
import { mailMachinePathPrefixes, mailMounts } from './mail-mount';
import { mailOneOriginConfig } from './one-origin';

describe('Mail one-origin configuration', () => {
  it('is ready for the /mail mount and admits nothing until the env opts in', () => {
    expect(mailOneOriginConfig({})).toMatchObject({
      basePath: '/mail',
      sharedOrigin: 'https://tuturuuu.com',
      subdomainOrigin: 'https://mail.tuturuuu.com',
      basePathReady: true,
      mode: 'off',
    });
  });
  it.each(['off', 'shadow', 'on'] as const)(
    'reads %s from the Mail variable',
    (mode) => {
      expect(mailOneOriginConfig({ TTR_ONE_ORIGIN_MAIL: mode }).mode).toBe(
        mode
      );
      expect(mailOneOriginConfig({ TTR_ONE_ORIGIN_MEET: mode }).mode).toBe(
        'off'
      );
    }
  );
  it('shares one machine-prefix list with the bridge mount', () => {
    expect(mailOneOriginConfig({}).machinePathPrefixes).toBe(
      mailMachinePathPrefixes
    );
    expect(mailMounts.machinePathPrefixes).toBe(mailMachinePathPrefixes);
    for (const prefix of ['/_fn', '/verify-token', '/vi/verify-token'])
      expect(mailMachinePathPrefixes).toContain(prefix);
  });
  it('honours deployed origins from the Worker environment', () => {
    expect(
      mailOneOriginConfig({
        NEXT_PUBLIC_WEB_APP_URL: 'https://web.example.test',
        NEXT_PUBLIC_APP_URL: 'https://mail.example.test',
      })
    ).toMatchObject({
      sharedOrigin: 'https://web.example.test',
      subdomainOrigin: 'https://mail.example.test',
    });
  });
});
