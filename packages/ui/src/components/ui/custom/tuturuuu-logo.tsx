import Image from 'next/image';

/** Absolute URL to the Tuturuuu logo hosted on the production domain. */
export const TUTURUUU_LOGO_URL =
  'https://tuturuuu.com/media/logos/transparent.png';

/**
 * Convenience wrapper around `<Image>` pre-configured with the Tuturuuu logo.
 * Uses `unoptimized` so no per-app `remotePatterns` config is required.
 */
export function TuturuuLogo({
  alt = 'Tuturuuu Logo',
  ...props
}: Omit<React.ComponentProps<typeof Image>, 'src' | 'alt'> & { alt?: string }) {
  return <Image src={TUTURUUU_LOGO_URL} alt={alt} unoptimized {...props} />;
}
