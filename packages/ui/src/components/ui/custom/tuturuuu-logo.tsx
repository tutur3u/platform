import Image, { type ImageProps } from 'next/image';

/** Absolute URL to the Tuturuuu logo hosted on the production domain. */
export const TUTURUUU_REMOTE_LOGO_URL =
  'https://tuturuuu.com/media/logos/transparent.png';
export const TUTURUUU_LOCAL_LOGO_URL = '/media/logos/transparent.png';
export const TUTURUUU_LOGO_URL = TUTURUUU_REMOTE_LOGO_URL;

/**
 * Convenience wrapper around `<Image>` pre-configured with the Tuturuuu logo.
 * Remote logo usage stays unoptimized so no per-app `remotePatterns` config is required.
 */
export function TuturuuLogo({
  alt = 'Tuturuuu Logo',
  src = TUTURUUU_LOGO_URL,
  unoptimized,
  ...props
}: Omit<ImageProps, 'alt' | 'src'> & {
  alt?: string;
  src?: ImageProps['src'];
}) {
  const shouldSkipOptimization =
    unoptimized ?? (typeof src === 'string' && /^https?:\/\//u.test(src));

  return (
    <Image
      src={src}
      alt={alt}
      unoptimized={shouldSkipOptimization}
      {...props}
    />
  );
}
