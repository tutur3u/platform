import type { Viewport } from 'next';
import { Noto_Sans, Nunito } from 'next/font/google';

export {
  type CommonMetadataConfig,
  createCommonMetadata,
  createPageMetadata,
  generateCommonMetadata,
  generatePageMetadata,
  NO_INDEX_ROBOTS,
  type PageMetadataConfig,
} from './metadata';

const notoSans = Noto_Sans({
  subsets: ['latin', 'vietnamese'],
  display: 'block',
});

/**
 * Nunito for the experimental Sorbet design. Not preloaded, so it is fetched
 * only when `data-ui="sorbet"` makes `.ttr-sorbet-font` use it.
 */
const sorbetSans = Nunito({
  subsets: ['latin', 'vietnamese'],
  display: 'swap',
  preload: false,
  variable: '--font-sorbet-sans',
});

/**
 * The app font. `className` also defines `--font-sorbet-sans` and the
 * `ttr-sorbet-font` marker that `@tuturuuu/ui` styles under `data-ui="sorbet"`.
 */
export const font = {
  ...notoSans,
  className: `${notoSans.className} ${sorbetSans.variable} ttr-sorbet-font`,
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: dark)', color: 'black' },
    { media: '(prefers-color-scheme: light)', color: 'white' },
  ],
  colorScheme: 'dark light',
};
