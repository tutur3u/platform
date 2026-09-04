import { describe, expect, it } from 'vitest';
import {
  buildPeriodicReportFallbackFilter,
  isMissingReportSearchRpc,
} from './report-search';

describe('buildPeriodicReportFallbackFilter', () => {
  it('searches report, student, class, teacher, and email fields', () => {
    const filter = buildPeriodicReportFallbackFilter('Anh Khoa');

    expect(filter).toContain('title.ilike."%Anh Khoa%"');
    expect(filter).toContain('user_full_name.ilike."%Anh Khoa%"');
    expect(filter).toContain('group_name.ilike."%Anh Khoa%"');
    expect(filter).toContain('creator_full_name.ilike."%Anh Khoa%"');
    expect(filter).toContain('creator_email.ilike."%Anh Khoa%"');
  });

  it('quotes PostgREST delimiters and escapes LIKE wildcards', () => {
    const filter = buildPeriodicReportFallbackFilter('A, B_100% "VIP"');

    expect(filter).toContain('title.ilike."%A, B\\_100\\% \\"VIP\\"%"');
  });
});

describe('isMissingReportSearchRpc', () => {
  it.each(['42883', 'PGRST202'])('recognizes missing RPC code %s', (code) => {
    expect(isMissingReportSearchRpc({ code })).toBe(true);
  });

  it('does not hide other database failures', () => {
    expect(isMissingReportSearchRpc({ code: '42501' })).toBe(false);
    expect(isMissingReportSearchRpc(new Error('network failure'))).toBe(false);
  });
});
