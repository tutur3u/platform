import { describe, expect, it } from 'vitest';
import {
  buildSafeCsv,
  escapeCsvCell,
  projectSafeExportRow,
  sanitizeExportFilename,
} from './csv-export';

describe('CSV export', () => {
  it('quotes delimiters, quotes, CR, and LF and joins records with CRLF', () => {
    expect(
      buildSafeCsv([
        ['Option', 'Votes', 'Note'],
        ['A, "quoted"', 42, 'line 1\r\nline 2'],
        ['B', null, 'line 1\nline 2'],
      ])
    ).toBe(
      'Option,Votes,Note\r\n"A, ""quoted""",42,"line 1\r\nline 2"\r\nB,,"line 1\nline 2"'
    );
    expect(buildSafeCsv([])).toBe('');
    expect(buildSafeCsv([['']])).toBe('""');
    expect(() => buildSafeCsv([['Option'], ['A', 42]])).toThrow(RangeError);
  });

  it.each([
    ['=1+1', "'=1+1"],
    ['+1', "'+1"],
    ['-1', "'-1"],
    ['@SUM(A1)', "'@SUM(A1)"],
    ['  =1', "'  =1"],
    ['\u00a0@SUM(A1)', "'\u00a0@SUM(A1)"],
    ['\u0085\u200b+1', "'\u0085\u200b+1"],
    ['\n  -1', '"\'\n  -1"'],
    ['\tHello', "'\tHello"],
    [' \rHello', '"\' \rHello"'],
    [' \n\t\r =1', '"\' \n\t\r =1"'],
    ['=HYPERLINK("a","b")', '"\'=HYPERLINK(""a"",""b"")"'],
    [-42, "'-42"],
    [42, '42'],
    [false, 'false'],
    [' cost - 42', ' cost - 42'],
  ] as const)('serializes %j as %j', (cell, expected) => {
    expect(escapeCsvCell(cell)).toBe(expected);
  });

  it('neutralizes formula-like headings as well as values', () => {
    expect(buildSafeCsv([['@Option'], ['+1']])).toBe("'@Option\r\n'+1");
  });

  it('blanks identity columns in anonymous rows without changing their order', () => {
    const row = {
      actorId: 'person-1',
      option: 'A',
      email: 'test@example.test',
    };
    const identityColumns = ['actorId', 'email'];

    const projected = projectSafeExportRow(row, {
      anonymous: true,
      identityColumns,
    });

    expect(Object.keys(projected)).toEqual(Object.keys(row));
    expect(buildSafeCsv([Object.values(projected)])).toBe(',A,');
    expect(
      projectSafeExportRow(row, { anonymous: false, identityColumns })
    ).toEqual(row);
    expect(row.actorId).toBe('person-1');
  });

  it('uses only the supplied own fields', () => {
    const row = Object.assign(Object.create({ email: 'inherited' }), {
      option: 'A',
    });
    expect(
      projectSafeExportRow(row, { anonymous: true, identityColumns: ['email'] })
    ).toEqual({ option: 'A' });
  });

  it.each([
    ['Poll results.CSV', 'Poll-results.csv'],
    ['../room\\poll.csv', 'room-poll.csv'],
    ['CON.txt', '_CON.txt.csv'],
    ['...', 'export.csv'],
    ['  ', 'export.csv'],
    ['.csv', 'export.csv'],
    ['K\u1ebft qu\u1ea3', 'K\u1ebft-qu\u1ea3.csv'],
  ])('sanitizes %j to %j', (filename, expected) => {
    expect(sanitizeExportFilename(filename)).toBe(expected);
  });

  it('bounds long filenames while preserving the extension', () => {
    expect(sanitizeExportFilename('a'.repeat(500))).toBe(
      'a'.repeat(116).concat('.csv')
    );
    const filename = sanitizeExportFilename('\u1ebf'.repeat(100));
    expect(filename).toBe('\u1ebf'.repeat(38).concat('.csv'));
    expect(new TextEncoder().encode(filename).length).toBeLessThanOrEqual(120);
  });
});
