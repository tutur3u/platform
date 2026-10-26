import { describe, expect, it } from 'vitest';
import {
  COHORT_COOKIE,
  decideCohort,
  parseCanaryPercent,
  RUNTIME_HEADER,
  tagResponse,
} from './canary';

describe('canary interface', () => {
  it('parses the percentage strictly and fails closed to 0', () => {
    expect(parseCanaryPercent('25')).toBe(25);
    expect(parseCanaryPercent(' 100 ')).toBe(100);
    for (const bad of [undefined, '', '-1', '101', '2.5', 'ten', '1e2'])
      expect(parseCanaryPercent(bad)).toBe(0);
  });

  it('keeps everyone on legacy when disabled, unless forced', () => {
    expect(decideCohort({ percent: '0', cookie: 'native' })).toMatchObject({
      cohort: 'legacy',
      reason: 'disabled',
      persist: false,
    });
    expect(decideCohort({ percent: undefined, force: 'native' })).toMatchObject(
      {
        cohort: 'native',
        reason: 'forced',
      }
    );
  });

  it('honours a sticky cohort and draws new browsers against the percentage', () => {
    expect(decideCohort({ percent: '10', cookie: 'native' }).reason).toBe(
      'cookie'
    );
    expect(decideCohort({ percent: '10', draw: () => 9.99 })).toMatchObject({
      cohort: 'native',
      persist: true,
    });
    expect(decideCohort({ percent: '10', draw: () => 10 }).cohort).toBe(
      'legacy'
    );
    expect(
      decideCohort({ percent: '10', cookie: 'bogus', draw: () => 50 })
    ).toMatchObject({ cohort: 'legacy', reason: 'drawn' });
  });

  it('tags every response and persists only new assignments', async () => {
    const drawn = tagResponse(
      new Response('body'),
      decideCohort({ percent: '100', draw: () => 0 }),
      { path: '/meet', secure: true }
    );
    expect(drawn.headers.get(RUNTIME_HEADER)).toBe('native');
    expect(drawn.headers.getSetCookie()).toEqual([
      `${COHORT_COOKIE}=native; Path=/meet; Max-Age=2592000; HttpOnly; SameSite=Lax; Secure`,
    ]);
    expect(await drawn.text()).toBe('body');
    const sticky = tagResponse(
      new Response(null),
      decideCohort({ percent: '5', cookie: 'legacy' })
    );
    expect(sticky.headers.get(RUNTIME_HEADER)).toBe('legacy');
    expect(sticky.headers.getSetCookie()).toEqual([]);
  });
});
