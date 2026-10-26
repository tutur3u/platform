'use client';

import type { ImageProps } from 'next/image';
import { forwardRef, type ImgHTMLAttributes } from 'react';

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt'> & {
  alt: string;
  src: ImageProps['src'];
  fill?: boolean;
  priority?: boolean;
  unoptimized?: boolean;
  quality?: number;
};

/** `next/image` without the optimizer: original URLs, native lazy loading. */
export default forwardRef<HTMLImageElement, Props>(function BridgeImage(
  {
    src,
    alt,
    fill,
    priority,
    unoptimized: _unoptimized,
    quality: _quality,
    style,
    loading,
    ...props
  },
  ref
) {
  const image =
    typeof src === 'string' ? null : 'default' in src ? src.default : src;
  return (
    // biome-ignore lint/performance/noImgElement: Native Start serves original image URLs without the Next optimizer.
    <img
      {...props}
      alt={alt}
      ref={ref}
      src={typeof src === 'string' ? src : image?.src}
      width={props.width ?? image?.width}
      height={props.height ?? image?.height}
      loading={priority ? 'eager' : (loading ?? 'lazy')}
      fetchPriority={priority ? 'high' : props.fetchPriority}
      style={
        fill
          ? {
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              ...style,
            }
          : style
      }
    />
  );
});
