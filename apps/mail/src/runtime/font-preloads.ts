import notoSansLatinUrl from '@fontsource-variable/noto-sans/files/noto-sans-latin-wght-normal.woff2?url';
import notoSansVietnameseUrl from '@fontsource-variable/noto-sans/files/noto-sans-vietnamese-wght-normal.woff2?url';

/**
 * Preload the variable font subsets `typography.css` declares so text renders
 * in its final face on the first frame instead of swapping in after the CSS
 * has been parsed. Vietnamese pages need both subsets; English only Latin.
 */
export function fontPreloads(locale: string) {
  const urls =
    locale === 'vi'
      ? [notoSansLatinUrl, notoSansVietnameseUrl]
      : [notoSansLatinUrl];
  return urls.map((href) => ({
    rel: 'preload',
    as: 'font',
    type: 'font/woff2',
    href,
    crossOrigin: 'anonymous',
  }));
}
