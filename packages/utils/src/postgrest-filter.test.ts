import { describe, expect, it } from 'vitest';
import {
  buildPostgrestIlikeOrFilter,
  quotePostgrestValue,
} from './postgrest-filter';

describe('quotePostgrestValue', () => {
  it('quotes and escapes backslashes and double quotes', () => {
    expect(quotePostgrestValue('a"b\\c')).toBe('"a\\"b\\\\c"');
  });
});

describe('buildPostgrestIlikeOrFilter', () => {
  it('builds one quoted operand per column', () => {
    expect(buildPostgrestIlikeOrFilter(['name', 'email'], 'ann')).toBe(
      'name.ilike."%ann%",email.ilike."%ann%"'
    );
  });

  it('escapes LIKE wildcards so they match literally', () => {
    expect(buildPostgrestIlikeOrFilter(['name'], '50%_off')).toBe(
      'name.ilike."%50\\\\%\\\\_off%"'
    );
  });

  it.each([
    'a%,archived.eq.true',
    'x)',
    'a"b',
    'a,b',
    '"),archived.eq.true,("',
  ])('keeps %j inside a single quoted operand per column', (input) => {
    const filter = buildPostgrestIlikeOrFilter(['name', 'email'], input);
    // Stripping the quoted operands must leave only the two bare filters.
    const withoutOperands = filter.replace(/"(?:[^"\\]|\\.)*"/g, '');
    expect(withoutOperands).toBe('name.ilike.,email.ilike.');
  });
});
