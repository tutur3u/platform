import small from './product-tour-480.webp?url';
import medium from './product-tour-960.webp?url';
import large from './product-tour-1280.webp?url';
import latin from '@tuturuuu/marketing-shell/fonts/be-vietnam-pro-800-latin.woff2?url';
import vietnamese from '@tuturuuu/marketing-shell/fonts/be-vietnam-pro-800-vietnamese.woff2?url';
export const poster = {
  src: large,
  srcSet: `${small} 480w, ${medium} 960w, ${large} 1280w`,
  sizes:
    '(min-width: 1280px) 960px, (min-width: 1024px) calc(100vw - 320px), (min-width: 640px) calc(100vw - 64px), calc(100vw - 46px)',
};
/** Resource hints are limited to the landing's LCP image and headline weight. */
export function landingPreloads(pathname: string) {
  if (!['/', '/en', '/vi'].includes(pathname)) return [];
  const fonts = pathname === '/vi' ? [latin, vietnamese] : [latin];
  return [
    {
      rel: 'preload',
      as: 'image',
      href: poster.src,
      imageSrcSet: poster.srcSet,
      imageSizes: poster.sizes,
      fetchPriority: 'high' as const,
    },
    ...fonts.map((href) => ({
      rel: 'preload',
      as: 'font',
      href,
      type: 'font/woff2',
      crossOrigin: 'anonymous' as const,
    })),
  ];
}
