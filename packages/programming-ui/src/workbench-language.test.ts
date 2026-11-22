import { PLAYGROUND_LANGUAGES } from '@tuturuuu/types/primitives/playgrounds';
import { expect, it } from 'vitest';
import {
  LANGUAGE_CODES,
  LANGUAGE_LABELS,
  LANGUAGE_TONES,
  languageForPath,
} from './workbench-language';

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

it('labels, codes and tints every runtime with dynamic tokens', () => {
  for (const language of PLAYGROUND_LANGUAGES) {
    expect(LANGUAGE_LABELS[language]).toBeTruthy();
    expect(LANGUAGE_CODES[language]).toBeTruthy();
    expect(LANGUAGE_TONES[language]).toMatch(
      /^bg-dynamic-\w+\/10 text-dynamic-\w+$/
    );
  }
  expect(LANGUAGE_CODES.cpp).toBe('C++');
});
