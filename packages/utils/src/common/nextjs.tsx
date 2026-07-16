import type { Viewport } from 'next';
import { Noto_Sans } from 'next/font/google';

export {
  type CommonMetadataConfig,
  createCommonMetadata,
  createPageMetadata,
  generateCommonMetadata,
  generatePageMetadata,
  NO_INDEX_ROBOTS,
  type PageMetadataConfig,
} from './metadata';

export const font = Noto_Sans({
  subsets: ['latin', 'vietnamese'],
  display: 'block',
});

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
