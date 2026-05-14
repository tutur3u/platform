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

  it('ignores wildcard listener URLs that are not browser destinations', () => {
    expect(
      resolveAppUrl({
        candidates: ['http://0.0.0.0:7814', 'http://[::]:7814'],
        fallback: 'https://hive.tuturuuu.com',
      })
    ).toBe('https://hive.tuturuuu.com');
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

  it('skips wildcard listener origins before resolving an internal app URL', () => {
    expect(
      resolveInternalAppUrl({
        appName: 'hive',
        candidates: ['http://0.0.0.0:7814', 'https://hive.tuturuuu.com'],
        fallback: 'http://localhost:7814',
      })
    ).toBe('https://hive.tuturuuu.com');
  });
});
