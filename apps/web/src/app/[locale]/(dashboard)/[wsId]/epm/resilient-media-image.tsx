'use client';

import Image from 'next/image';
import { useState } from 'react';

export function ResilientMediaImage({
  alt,
  assetUrl,
  className,
  fill = false,
  height,
  previewUrl,
  sizes,
  width,
}: {
  alt: string;
  assetUrl?: string | null;
  className?: string;
  fill?: boolean;
  height?: number;
  previewUrl?: string | null;
  sizes?: string;
  width?: number;
}) {
  const sources = [previewUrl, assetUrl].filter((value): value is string =>
    Boolean(value)
  );
  const [failedSources, setFailedSources] = useState<string[]>([]);
  const currentSource = sources.find(
    (source) => !failedSources.includes(source)
  );
  const shouldBypassOptimizer = currentSource?.startsWith('/api/') ?? false;

  if (!currentSource) {
    return null;
  }

  const handleError = () => {
    setFailedSources((current) => [...current, currentSource]);
  };

  if (fill) {
    return (
      <Image
        alt={alt}
        className={className}
        fill
        sizes={sizes}
        src={currentSource}
        unoptimized={shouldBypassOptimizer}
        onError={handleError}
      />
    );
  }

  if (!width || !height) {
    return null;
  }

  return (
    <Image
      alt={alt}
      className={className}
      height={height}
      src={currentSource}
      unoptimized={shouldBypassOptimizer}
      width={width}
      onError={handleError}
    />
  );
}
