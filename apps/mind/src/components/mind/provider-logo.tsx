'use client';

import { Sparkles } from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';
import Image from 'next/image';
import { useState } from 'react';

const LOGOS_BASE = 'https://models.dev/logos';

function toProviderId(provider: string) {
  return provider
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace('google-vertex', 'vertex');
}

export function ProviderLogo({
  className,
  provider,
  size = 16,
}: {
  className?: string;
  provider: string;
  size?: number;
}) {
  const [error, setError] = useState(false);

  if (error) {
    return (
      <Sparkles
        className={cn('shrink-0 text-muted-foreground', className)}
        style={{ height: size, width: size }}
      />
    );
  }

  return (
    <Image
      alt=""
      className={cn('shrink-0 dark:invert', className)}
      height={size}
      onError={() => setError(true)}
      src={`${LOGOS_BASE}/${toProviderId(provider)}.svg`}
      unoptimized
      width={size}
    />
  );
}
