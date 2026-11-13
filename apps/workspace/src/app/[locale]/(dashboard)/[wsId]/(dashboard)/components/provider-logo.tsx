'use client';

import { Sparkles } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import Image from 'next/image';
import { useState } from 'react';

const LOGOS_BASE = 'https://models.dev/logos';

/** Normalize provider name to Provider ID used by models.dev */
export function toProviderId(provider: string): string {
  return provider
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace('google-vertex', 'vertex');
}

interface ProviderLogoProps {
  provider: string;
  size?: number;
  className?: string;
}

/** Renders provider logo from models.dev. Falls back to Sparkles icon on error. */
export function ProviderLogo({
  provider,
  size = 16,
  className,
}: ProviderLogoProps) {
  const [error, setError] = useState(false);
  const providerId = toProviderId(provider);
  const src = `${LOGOS_BASE}/${providerId}.svg`;

  if (error) {
    return (
      <Sparkles
        className={cn('shrink-0 text-muted-foreground', className)}
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <Image
      src={src}
      alt=""
      width={size}
      height={size}
      className={cn('shrink-0 dark:invert', className)}
      unoptimized
      onError={() => setError(true)}
    />
  );
}
