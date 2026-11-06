// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  brandingFontPreloads,
  marketingFontPreloads,
  rootFontPreloads,
} from './preload-sets';
import { type FontSubsetName, fontSubsetFiles } from './subset-files';

interface Face {
  family: string;
  display: string;
  name: FontSubsetName;
  ranges: Array<[number, number]>;
}

const nameByUrl = new Map<string, FontSubsetName>(
  Object.entries(fontSubsetFiles).map(([name, url]) => [
    url,
    name as FontSubsetName,
  ])
);

function readFaces(file: string): Face[] {
  const css = readFileSync(
    fileURLToPath(new URL(`./${file}`, import.meta.url)),
    'utf8'
  );
  const faces: Face[] = [];
  for (const [, block = ''] of css.matchAll(/@font-face\s*\{([^}]+)\}/gu)) {
    const url = /url\("([^"]+)"\)/u.exec(block)?.[1];
    if (!url?.startsWith('/fonts/subsets/')) continue;
    const name = nameByUrl.get(url);
    if (!name) throw new Error(`${file} references unknown ${url}`);
    const range = /unicode-range:\s*([^;]+);/u.exec(block)?.[1] ?? '';
    faces.push({
      family: /font-family:\s*"([^"]+)"/u.exec(block)?.[1] ?? '',
      display: /font-display:\s*([a-z]+);/u.exec(block)?.[1] ?? '',
      name,
      ranges: range.split(',').map((token) => {
        const [start = '', end = start] = token
          .trim()
          .replace(/^U\+/u, '')
          .split('-');
        return [Number.parseInt(start, 16), Number.parseInt(end, 16)];
      }),
    });
  }
  return faces;
}

// CSS Fonts 4: overlapping faces of one family are tried in reverse
// declaration order; the first face whose unicode-range covers a character is
// fetched. Declared ranges are a subset of each file's cmap (checked by
// scripts/fonts/test_web_fonts.py), so that face also renders the character.
function facesNeeded(faces: Face[], text: string) {
  const needed = new Set<FontSubsetName>();
  for (const char of new Set(text)) {
    const codepoint = char.codePointAt(0) ?? 0;
    const face = [...faces]
      .reverse()
      .find(({ ranges }) =>
        ranges.some(([start, end]) => start <= codepoint && codepoint <= end)
      );
    if (face) needed.add(face.name);
  }
  return needed;
}

const tones = ['', '̀', '́', '̉', '̃', '̣'];
const vietnameseLower = [
  ...'aăâeêioôơuưy'
    .split('')
    .flatMap((vowel) =>
      tones.map((tone) => `${vowel}${tone}`.normalize('NFC'))
    ),
  ...'bcdđghklmnpqrstvx'.split(''),
].join('');
const vietnamese = `${vietnameseLower}${vietnameseLower.toUpperCase()}`;
const english =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

const rootFaces = readFaces('root.css').filter(
  ({ family }) => family === 'Noto Sans'
);
const marketingFaces = readFaces('marketing.css');

describe('web font preloads', () => {
  it('reads the paint-blocking root faces from the generated stylesheet', () => {
    expect(rootFaces).toHaveLength(4);
    expect(new Set(rootFaces.map(({ display }) => display))).toEqual(
      new Set(['block'])
    );
  });

  it('preloads exactly the blocking faces Vietnamese text fetches on vi pages', () => {
    const needed = facesNeeded(rootFaces, `${vietnamese}${english}`);
    expect(needed).toContain('noto-sans-latin-ext-extended');
    expect(new Set(rootFontPreloads('vi'))).toEqual(needed);
  });

  it('keeps the original core-only root preloads on en pages', () => {
    expect(rootFontPreloads('en')).toEqual([
      'noto-sans-latin-core',
      'noto-sans-vietnamese-core',
    ]);
    for (const name of facesNeeded(rootFaces, english))
      expect(rootFontPreloads('en')).toContain(name);
  });

  it('leaves swap-display marketing extended faces on demand', () => {
    expect(marketingFaces.length).toBeGreaterThan(0);
    for (const { display } of marketingFaces) expect(display).toBe('swap');
    expect(marketingFontPreloads).toEqual([
      'be-vietnam-pro-500-latin-core',
      'be-vietnam-pro-500-vietnamese-core',
      'be-vietnam-pro-600-latin-core',
      'be-vietnam-pro-600-vietnamese-core',
      'be-vietnam-pro-700-latin-core',
      'be-vietnam-pro-700-vietnamese-core',
      'be-vietnam-pro-800-latin-core',
      'be-vietnam-pro-800-vietnamese-core',
      'jetbrains-mono-core',
    ]);
    expect(brandingFontPreloads).toEqual(['inter-core']);
  });

  it('preloads only content-hashed core or Vietnamese Latin Extended files', () => {
    for (const name of [
      ...rootFontPreloads('vi'),
      ...marketingFontPreloads,
      ...brandingFontPreloads,
    ]) {
      expect(fontSubsetFiles[name]).toMatch(
        /^\/fonts\/subsets\/[a-z0-9-]+\.[0-9a-f]{10}\.woff2$/u
      );
      expect(
        name.endsWith('-core') || name === 'noto-sans-latin-ext-extended'
      ).toBe(true);
    }
  });
});
