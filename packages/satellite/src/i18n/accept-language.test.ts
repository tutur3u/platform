import { describe, expect, it } from 'vitest';
import { negotiateAcceptLanguage } from './accept-language';

const supported = ['en', 'vi'] as const;

describe('negotiateAcceptLanguage', () => {
  it.each([
    ['vi-VN,vi;q=0.9,en;q=0.8', 'vi'],
    ['en-GB,en;q=0.9', 'en'],
    ['fr-FR,fr;q=0.9', 'en'],
    ['en;q=0.2,vi;q=0.8', 'vi'],
  ])('matches %s to %s', (header, locale) => {
    expect(negotiateAcceptLanguage(header, supported, 'en')).toBe(locale);
  });

  it.each([
    ['*', 'en'],
    ['*;q=0.5', 'en'],
    ['vi-VN,*;q=0.1', 'vi'],
    ['not a language!!', 'en'],
    ['vi-VN,not a language!!;q=0.9', 'vi'],
    ['', 'en'],
  ])('never throws for %j and falls back sensibly', (header, locale) => {
    expect(negotiateAcceptLanguage(header, supported, 'en')).toBe(locale);
  });

  it('uses the browser default when the header is missing', () => {
    expect(negotiateAcceptLanguage(null, supported, 'vi')).toBe('en');
    expect(negotiateAcceptLanguage(undefined, supported, 'en')).toBe('en');
  });
});
