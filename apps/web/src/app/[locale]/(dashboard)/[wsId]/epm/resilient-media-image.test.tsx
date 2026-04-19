import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ResilientMediaImage } from './resilient-media-image';

vi.mock('next/image', () => ({
  default: ({
    alt,
    src,
    unoptimized,
  }: {
    alt: string;
    src: string;
    unoptimized?: boolean;
  }) => (
    // biome-ignore lint/performance/noImgElement: test double for next/image props
    <img
      alt={alt}
      data-src={src}
      data-unoptimized={unoptimized ? 'true' : 'false'}
    />
  ),
}));

describe('ResilientMediaImage', () => {
  it('bypasses the Next image optimizer for internal asset API URLs', () => {
    render(
      <ResilientMediaImage
        alt="Asset"
        assetUrl="/api/v1/workspaces/ws_123/external-projects/assets/asset-1"
        height={320}
        width={240}
      />
    );

    expect(screen.getByAltText('Asset')).toHaveAttribute(
      'data-unoptimized',
      'true'
    );
  });

  it('keeps optimization enabled for non-internal asset URLs', () => {
    render(
      <ResilientMediaImage
        alt="Asset"
        assetUrl="https://cdn.example.com/asset.png"
        height={320}
        width={240}
      />
    );

    expect(screen.getByAltText('Asset')).toHaveAttribute(
      'data-unoptimized',
      'false'
    );
  });
});
