import { PLAYGROUND_LANGUAGES } from '@tuturuuu/types/primitives/playgrounds';
import { expect, it } from 'vitest';
import { LANGUAGE_LABELS, languageForPath } from './workbench-language';

it('derives a file runtime from its extension and skips docs and data', () => {
  expect(languageForPath('main.py')).toBe('python');
  expect(languageForPath('src/app.TSX')).toBe('typescript');
  expect(languageForPath('lib/util.mjs')).toBe('javascript');
  expect(languageForPath('main.cpp')).toBe('cpp');
  expect(languageForPath('run.sh')).toBe('shell');
  expect(languageForPath('README.md')).toBeUndefined();
  expect(languageForPath('.env')).toBeUndefined();
  expect(languageForPath('Makefile')).toBeUndefined();
});

it('labels every runtime', () => {
  for (const language of PLAYGROUND_LANGUAGES)
    expect(LANGUAGE_LABELS[language]).toBeTruthy();
  expect(LANGUAGE_LABELS.cpp).toBe('C++');
});
