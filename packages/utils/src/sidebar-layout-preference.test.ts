import { describe, expect, it } from 'vitest';
import {
  parseSidebarSizeCookie,
  readSidebarSizeFromCookieHeader,
  resolveSidebarExpandedWidth,
  SIDEBAR_SIZE_COOKIE_NAME,
  sidebarSizeCookieOptions,
} from './sidebar-layout-preference';

describe('sidebar size cookie', () => {
  it('accepts a rail length and rejects legacy panel percentages', () => {
    expect(parseSidebarSizeCookie('18.5rem')).toBe('18.5rem');
    expect(parseSidebarSizeCookie(' 320px ')).toBe('320px');
    expect(parseSidebarSizeCookie('12rem')).toBe('12rem');
    expect(parseSidebarSizeCookie('32rem')).toBe('32rem');
    expect(parseSidebarSizeCookie('192px')).toBe('192px');
    expect(parseSidebarSizeCookie('512px')).toBe('512px');
    expect(parseSidebarSizeCookie('28')).toBeNull();
    expect(parseSidebarSizeCookie('28%')).toBeNull();
    expect(parseSidebarSizeCookie('20rem;color:red')).toBeNull();
    expect(parseSidebarSizeCookie('8rem')).toBeNull();
    expect(parseSidebarSizeCookie('40rem')).toBeNull();
    expect(parseSidebarSizeCookie('20px')).toBeNull();
    expect(parseSidebarSizeCookie('999px')).toBeNull();
    expect(parseSidebarSizeCookie('4rem')).toBeNull();
  });

  it('keeps the last valid length ahead of a later legacy percentage', () => {
    const name = SIDEBAR_SIZE_COOKIE_NAME;
    expect(readSidebarSizeFromCookieHeader(`${name}=20rem; ${name}=28`)).toBe(
      '20rem'
    );
    expect(readSidebarSizeFromCookieHeader(`${name}=28; ${name}=20rem`)).toBe(
      '20rem'
    );
    expect(
      readSidebarSizeFromCookieHeader(`${name}=22rem; ${name}=15rem`)
    ).toBe('15rem');
    expect(readSidebarSizeFromCookieHeader(`${name}=28`)).toBeNull();
    expect(resolveSidebarExpandedWidth(null, '15rem')).toBe('15rem');
    expect(resolveSidebarExpandedWidth(null, '16rem')).toBe('16rem');
    expect(resolveSidebarExpandedWidth('22rem', '15rem')).toBe('22rem');
  });

  it('shares the width cookie on the parent domain for mail and calendar', () => {
    expect(sidebarSizeCookieOptions('https://mail.tuturuuu.com')).toMatchObject(
      {
        domain: '.tuturuuu.com',
        path: '/',
        secure: true,
      }
    );
    expect(
      sidebarSizeCookieOptions('https://calendar.tuturuuu.com').domain
    ).toBe('.tuturuuu.com');
    expect(sidebarSizeCookieOptions('https://meet.tuturuuu.com').domain).toBe(
      '.tuturuuu.com'
    );
  });
});
