import { describe, expect, it } from 'vitest';
import { resolveAppUrl, resolveInternalAppUrl } from '../app-url';

describe('resolveAppUrl', () => {
  it('uses the first valid configured URL', () => {
    expect(
      resolveAppUrl({
        candidates: ['development', 'https://learn.tuturuuu.com/'],
        fallback: 'http://localhost:7812',
      })
    ).toBe('https://learn.tuturuuu.com');
  });

  it('falls back when configured values are not absolute HTTP URLs', () => {
    expect(
      resolveAppUrl({
        candidates: ['development', '', 'ftp://learn.tuturuuu.com'],
        fallback: 'http://localhost:7812',
      })
    ).toBe('http://localhost:7812');
  });
});

describe('resolveInternalAppUrl', () => {
  it('skips configured URLs that belong to another registered internal app', () => {
    expect(
      resolveInternalAppUrl({
        appName: 'learn',
        candidates: ['https://tuturuuu.com', 'https://learn.tuturuuu.com'],
        fallback: 'http://localhost:7812',
      })
    ).toBe('https://learn.tuturuuu.com');
  });

  it('falls back when every configured URL points at another internal app', () => {
    expect(
      resolveInternalAppUrl({
        appName: 'nova',
        candidates: ['https://tuturuuu.com', 'https://learn.tuturuuu.com'],
        fallback: 'https://nova.ai.vn',
      })
    ).toBe('https://nova.ai.vn');
  });

  it('keeps custom app origins that are not registered to another app', () => {
    expect(
      resolveInternalAppUrl({
        appName: 'cms',
        candidates: ['https://cms-preview.example.com/'],
        fallback: 'https://cms.tuturuuu.com',
      })
    ).toBe('https://cms-preview.example.com');
  });
});
