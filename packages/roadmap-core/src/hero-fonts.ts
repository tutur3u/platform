import latin500 from '@tuturuuu/marketing-shell/fonts/be-vietnam-pro-500-latin.woff2?url';
import vietnamese500 from '@tuturuuu/marketing-shell/fonts/be-vietnam-pro-500-vietnamese.woff2?url';
import latin600 from '@tuturuuu/marketing-shell/fonts/be-vietnam-pro-600-latin.woff2?url';
import vietnamese600 from '@tuturuuu/marketing-shell/fonts/be-vietnam-pro-600-vietnamese.woff2?url';
import type { Lang } from './components/shared';

/**
 * The two hero weights (500 text, 600 headline), preloaded so the largest
 * paint does not wait for CSS to discover them. Vietnamese pages also need
 * the Vietnamese subset; English pages never download it.
 */
export function heroFontPreloads(lang: Lang) {
  const files =
    lang === 'vi'
      ? [latin500, latin600, vietnamese500, vietnamese600]
      : [latin500, latin600];
  return files.map((href) => ({
    rel: 'preload',
    as: 'font',
    type: 'font/woff2',
    href,
    crossOrigin: 'anonymous' as const,
  }));
}
