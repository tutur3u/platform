import type { FontSubsetName } from './subset-files';

// The root Noto Sans faces use `font-display: block`, so a face found only
// after the CSS applies delays text paint. The CSS keeps Google's face order
// for pixel parity, which makes the Latin Extended face win for ă, đ, ơ, ư and
// ỳ–ỹ: every `vi` page fetches it, so `vi` preloads it. `en` keeps the
// original core-only set.
export function rootFontPreloads(locale: string): FontSubsetName[] {
  return [
    'noto-sans-latin-core',
    'noto-sans-vietnamese-core',
    ...(locale === 'vi' ? (['noto-sans-latin-ext-extended'] as const) : []),
  ];
}

// Marketing display and mono faces use `font-display: swap`, so late faces
// never block paint. Their Latin Extended files stay on demand: a page fetches
// them only for the weights its Vietnamese text actually uses.
export const marketingFontPreloads: readonly FontSubsetName[] = [
  'be-vietnam-pro-500-latin-core',
  'be-vietnam-pro-500-vietnamese-core',
  'be-vietnam-pro-600-latin-core',
  'be-vietnam-pro-600-vietnamese-core',
  'be-vietnam-pro-700-latin-core',
  'be-vietnam-pro-700-vietnamese-core',
  'be-vietnam-pro-800-latin-core',
  'be-vietnam-pro-800-vietnamese-core',
  'jetbrains-mono-core',
];

export const brandingFontPreloads: readonly FontSubsetName[] = ['inter-core'];
