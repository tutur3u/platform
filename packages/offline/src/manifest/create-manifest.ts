import type { Manifest, ManifestConfig } from './types';

/**
 * Creates a web app manifest with proper PWA configuration.
 *
 * @param config - Configuration options for the manifest
 * @returns A properly formatted web app manifest
 *
 * @example
 * ```ts
 * // In your app/manifest.ts:
 * import { createManifest } from '@tuturuuu/offline/manifest';
 *
 * export default function manifest() {
 *   return createManifest({
 *     name: 'My App',
 *     description: 'My awesome app',
 *     icons: [
 *       { src: '/icon-192.png', sizes: '192x192', purpose: 'maskable' },
 *       { src: '/icon-512.png', sizes: '512x512', purpose: 'any' },
 *     ],
 *     screenshots: [
 *       { src: '/screenshots/desktop.png', sizes: '1280x720', form_factor: 'wide' },
 *       { src: '/screenshots/mobile.png', sizes: '750x1334', form_factor: 'narrow' },
 *     ],
 *   });
 * }
 * ```
 */
export function createManifest(config: ManifestConfig): Manifest {
  const {
    name,
    shortName = name,
    description,
    startUrl = '/',
    display = 'standalone',
    orientation = 'any',
    backgroundColor = '#ffffff',
    themeColor = '#000000',
    icons,
    categories = [],
    screenshots = [],
  } = config;

  const manifest: Manifest = {
    name,
    short_name: shortName,
    description,
    id: startUrl,
    start_url: startUrl,
    scope: '/',
    display,
    orientation,
    background_color: backgroundColor,
    theme_color: themeColor,
    prefer_related_applications: false,
    categories,
    icons: icons.map((icon) => ({
      src: icon.src,
      sizes: icon.sizes,
      type: icon.type || 'image/png',
      purpose: icon.purpose,
    })),
  };

  // Only add screenshots if provided
  if (screenshots.length > 0) {
    manifest.screenshots = screenshots.map((screenshot) => ({
      src: screenshot.src,
      sizes: screenshot.sizes,
      type: screenshot.type || 'image/png',
      form_factor: screenshot.form_factor,
      label: screenshot.label,
    }));
  }

  return manifest;
}
