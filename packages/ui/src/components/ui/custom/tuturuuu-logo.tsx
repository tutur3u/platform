import Image, { type ImageProps } from 'next/image';
import { TUTURUUU_LOGO_URL } from './tuturuuu-logo-urls';

export {
  TUTURUUU_LOCAL_LOGO_URL,
  TUTURUUU_LOGO_URL,
  TUTURUUU_REMOTE_LOGO_URL,
} from './tuturuuu-logo-urls';

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
