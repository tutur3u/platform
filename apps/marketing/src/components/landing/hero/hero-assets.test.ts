import { describe, expect, it } from 'vitest';
import { landingPreloads, poster } from './hero-assets';
describe('landing LCP resources', () => {
  it('never preloads the landing poster on another route', () => {
    for (const path of ['/contact', '/about', '/products', '/vi/contact'])
      expect(landingPreloads(path)).toEqual([]);
  });
  it('preloads the responsive poster and only the required headline subsets', () => {
    expect(
      landingPreloads('/').filter((item) => item.as === 'font')
    ).toHaveLength(1);
    expect(
      landingPreloads('/vi').filter((item) => item.as === 'font')
    ).toHaveLength(2);
    const image = landingPreloads('/')[0];
    expect(image).toMatchObject({
      as: 'image',
      href: poster.src,
      imageSrcSet: poster.srcSet,
      imageSizes: poster.sizes,
    });
    expect(poster.srcSet).toContain('480w');
    expect(poster.srcSet).toContain('960w');
    expect(poster.srcSet).toContain('1280w');
    expect(landingPreloads('/').every((item) => item.rel === 'preload')).toBe(
      true
    );
  });
});
