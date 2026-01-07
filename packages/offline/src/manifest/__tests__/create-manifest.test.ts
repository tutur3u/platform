import { describe, expect, it } from 'vitest';
import { createManifest } from '../create-manifest';

describe('createManifest', () => {
  it('should create a manifest with required fields', () => {
    const manifest = createManifest({
      name: 'Test App',
      description: 'A test application',
      icons: [{ src: '/icon.png', sizes: '192x192' }],
    });

    expect(manifest.name).toBe('Test App');
    expect(manifest.short_name).toBe('Test App');
    expect(manifest.description).toBe('A test application');
    expect(manifest.start_url).toBe('/');
    expect(manifest.display).toBe('standalone');
  });

  it('should use shortName when provided', () => {
    const manifest = createManifest({
      name: 'My Long Application Name',
      shortName: 'MyApp',
      description: 'A test application',
      icons: [{ src: '/icon.png', sizes: '192x192' }],
    });

    expect(manifest.short_name).toBe('MyApp');
  });

  it('should include all icon properties', () => {
    const manifest = createManifest({
      name: 'Test App',
      description: 'A test application',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', purpose: 'maskable' },
        {
          src: '/icon-512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any',
        },
      ],
    });

    expect(manifest.icons).toHaveLength(2);
    expect(manifest.icons?.[0]).toEqual({
      src: '/icon-192.png',
      sizes: '192x192',
      type: 'image/png',
      purpose: 'maskable',
    });
  });

  it('should use default icon type when not provided', () => {
    const manifest = createManifest({
      name: 'Test App',
      description: 'A test application',
      icons: [{ src: '/icon.png', sizes: '192x192' }],
    });

    expect(manifest.icons?.[0]?.type).toBe('image/png');
  });

  it('should use custom colors when provided', () => {
    const manifest = createManifest({
      name: 'Test App',
      description: 'A test application',
      icons: [{ src: '/icon.png', sizes: '192x192' }],
      backgroundColor: '#000000',
      themeColor: '#ff0000',
    });

    expect(manifest.background_color).toBe('#000000');
    expect(manifest.theme_color).toBe('#ff0000');
  });

  it('should use default colors when not provided', () => {
    const manifest = createManifest({
      name: 'Test App',
      description: 'A test application',
      icons: [{ src: '/icon.png', sizes: '192x192' }],
    });

    expect(manifest.background_color).toBe('#ffffff');
    expect(manifest.theme_color).toBe('#000000');
  });

  it('should include categories when provided', () => {
    const manifest = createManifest({
      name: 'Test App',
      description: 'A test application',
      icons: [{ src: '/icon.png', sizes: '192x192' }],
      categories: ['productivity', 'utilities'],
    });

    expect(manifest.categories).toEqual(['productivity', 'utilities']);
  });

  it('should use empty categories array when not provided', () => {
    const manifest = createManifest({
      name: 'Test App',
      description: 'A test application',
      icons: [{ src: '/icon.png', sizes: '192x192' }],
    });

    expect(manifest.categories).toEqual([]);
  });

  it('should set prefer_related_applications to false', () => {
    const manifest = createManifest({
      name: 'Test App',
      description: 'A test application',
      icons: [{ src: '/icon.png', sizes: '192x192' }],
    });

    expect(manifest.prefer_related_applications).toBe(false);
  });

  it('should set id to match start_url', () => {
    const manifest = createManifest({
      name: 'Test App',
      description: 'A test application',
      icons: [{ src: '/icon.png', sizes: '192x192' }],
      startUrl: '/app',
    });

    expect(manifest.id).toBe('/app');
    expect(manifest.start_url).toBe('/app');
  });

  it('should set scope to root', () => {
    const manifest = createManifest({
      name: 'Test App',
      description: 'A test application',
      icons: [{ src: '/icon.png', sizes: '192x192' }],
    });

    expect(manifest.scope).toBe('/');
  });

  it('should use custom display mode when provided', () => {
    const manifest = createManifest({
      name: 'Test App',
      description: 'A test application',
      icons: [{ src: '/icon.png', sizes: '192x192' }],
      display: 'fullscreen',
    });

    expect(manifest.display).toBe('fullscreen');
  });

  it('should use custom orientation when provided', () => {
    const manifest = createManifest({
      name: 'Test App',
      description: 'A test application',
      icons: [{ src: '/icon.png', sizes: '192x192' }],
      orientation: 'portrait',
    });

    expect(manifest.orientation).toBe('portrait');
  });

  it('should use default orientation when not provided', () => {
    const manifest = createManifest({
      name: 'Test App',
      description: 'A test application',
      icons: [{ src: '/icon.png', sizes: '192x192' }],
    });

    expect(manifest.orientation).toBe('any');
  });

  it('should not include screenshots when not provided', () => {
    const manifest = createManifest({
      name: 'Test App',
      description: 'A test application',
      icons: [{ src: '/icon.png', sizes: '192x192' }],
    });

    expect(manifest.screenshots).toBeUndefined();
  });

  it('should include screenshots with form_factor when provided', () => {
    const manifest = createManifest({
      name: 'Test App',
      description: 'A test application',
      icons: [{ src: '/icon.png', sizes: '192x192' }],
      screenshots: [
        {
          src: '/screenshots/desktop.png',
          sizes: '1280x720',
          form_factor: 'wide',
          label: 'Desktop View',
        },
        {
          src: '/screenshots/mobile.png',
          sizes: '750x1334',
          form_factor: 'narrow',
          label: 'Mobile View',
        },
      ],
    });

    expect(manifest.screenshots).toHaveLength(2);
    expect(manifest.screenshots?.[0]).toEqual({
      src: '/screenshots/desktop.png',
      sizes: '1280x720',
      type: 'image/png',
      form_factor: 'wide',
      label: 'Desktop View',
    });
    expect(manifest.screenshots?.[1]).toEqual({
      src: '/screenshots/mobile.png',
      sizes: '750x1334',
      type: 'image/png',
      form_factor: 'narrow',
      label: 'Mobile View',
    });
  });

  it('should use custom screenshot type when provided', () => {
    const manifest = createManifest({
      name: 'Test App',
      description: 'A test application',
      icons: [{ src: '/icon.png', sizes: '192x192' }],
      screenshots: [
        {
          src: '/screenshots/desktop.jpg',
          sizes: '1280x720',
          type: 'image/jpeg',
          form_factor: 'wide',
        },
      ],
    });

    expect(manifest.screenshots?.[0]?.type).toBe('image/jpeg');
  });
});
