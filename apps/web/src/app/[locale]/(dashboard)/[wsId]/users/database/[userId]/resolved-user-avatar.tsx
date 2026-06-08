'use client';

import { cn } from '@tuturuuu/utils/format';
import type { ImgHTMLAttributes, SyntheticEvent } from 'react';
import { useState } from 'react';

type ResolvedUserAvatarProps = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  'src'
> & {
  src?: string | null;
};

export function ResolvedUserAvatar({
  src,
  alt,
  className,
  onError,
  ...props
}: ResolvedUserAvatarProps) {
  const [hidden, setHidden] = useState(false);

  if (!src || hidden) return null;

  const handleError = (event: SyntheticEvent<HTMLImageElement, Event>) => {
    onError?.(event);
    setHidden(true);
  };

  return (
    // biome-ignore lint/performance/noImgElement: Supabase public avatars are served directly to avoid Next image proxy failures.
    <img
      src={src}
      alt={alt}
      className={cn('aspect-square object-cover', className)}
      onError={handleError}
      {...props}
    />
  );
}
