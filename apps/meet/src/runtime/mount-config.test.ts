import { resolveAppBase } from '@tuturuuu/start-bridge/mounts';
import { describe, expect, it } from 'vitest';
import {
  isMeetStagingCanonical,
  meetDocumentOrigin,
  meetMounts,
} from './mount-config';

const env = {
  NEXT_PUBLIC_APP_URL: 'https://meet.tuturuuu.com',
  APP_ORIGIN: 'https://tuturuuu.com',
  APP_BASE_PATH: '/meet',
};

describe('Meet host and mount ownership', () => {
  it('serves root and mounted documents from one mount configuration', () => {
    const config = meetMounts(env);
    expect(
      resolveAppBase(new URL('https://meet.tuturuuu.com/vi/r/code'), config)
    ).toEqual({ mode: 'root', basePath: '' });
    for (const path of [
      '/meet',
      '/meet/',
      '/meet/vi/r/code',
      '/meet/api/build-info',
    ]) {
      expect(resolveAppBase(new URL(path, env.APP_ORIGIN), config)).toEqual({
        mode: 'mounted',
        basePath: '/meet',
      });
    }
    for (const path of [
      '/api/build-info',
      '/meeting',
      '/meet-together',
      '/vi/meet',
    ]) {
      expect(resolveAppBase(new URL(path, env.APP_ORIGIN), config)).toBeNull();
    }
  });

  it('uses the document origin for Live checks independently of the base path', () => {
    expect(meetDocumentOrigin('root', env)).toBe('https://meet.tuturuuu.com');
    expect(meetDocumentOrigin('mounted', env)).toBe('https://tuturuuu.com');
    const staging = {
      NEXT_PUBLIC_APP_URL: 'https://meet-staging.workers.dev',
      APP_ORIGIN: 'https://staging.tuturuuu.com',
      APP_BASE_PATH: '/meet',
    };
    expect(meetDocumentOrigin('root', staging)).toBe(
      'https://meet-staging.workers.dev'
    );
    expect(meetDocumentOrigin('mounted', staging)).toBe(
      'https://staging.tuturuuu.com'
    );
  });
});

it('keeps the staging profile off canonical hosts', () => {
  const staging = { ...env, TUTURUUU_NOINDEX: '1' };
  expect(
    isMeetStagingCanonical(new Request('https://tuturuuu.com/meet'), staging)
  ).toBe(true);
  expect(
    isMeetStagingCanonical(
      new Request('https://meet.tuturuuu.com/r/code'),
      staging
    )
  ).toBe(true);
  expect(
    isMeetStagingCanonical(
      new Request('https://meet-staging.workers.dev/r/code'),
      staging
    )
  ).toBe(false);
  expect(
    isMeetStagingCanonical(new Request('https://tuturuuu.com/meet'), env)
  ).toBe(false);
  for (const host of ['www.tuturuuu.com', 'www.meet.tuturuuu.com']) {
    expect(
      isMeetStagingCanonical(new Request(`https://${host}/meet`), staging)
    ).toBe(true);
  }
});
