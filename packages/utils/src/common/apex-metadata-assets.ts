// Public brand assets served by the apex even when an app is mounted there.
// App-owned metadata assets must resolve through the app's own Worker.
export const apexMetadataAssetTypes: ReadonlyMap<string, readonly string[]> =
  new Map([
    [
      'https://tuturuuu.com/favicon.ico',
      ['image/vnd.microsoft.icon', 'image/x-icon'],
    ],
    ['https://tuturuuu.com/favicon-16x16.png', ['image/png']],
    ['https://tuturuuu.com/favicon-32x32.png', ['image/png']],
    ['https://tuturuuu.com/apple-touch-icon.png', ['image/png']],
    [
      'https://tuturuuu.com/manifest.webmanifest',
      ['application/manifest+json'],
    ],
    ['https://tuturuuu.com/media/logos/og-image.jpg', ['image/jpeg']],
  ]);
