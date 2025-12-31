import type { MetadataRoute } from 'next';

export interface ManifestIcon {
  src: string;
  sizes: string;
  type?: string;
  purpose?: 'maskable' | 'any' | 'monochrome';
}

export interface ManifestScreenshot {
  src: string;
  sizes: string;
  type?: string;
  /**
   * Form factor for the screenshot
   * - 'wide': Desktop/tablet landscape (required for desktop PWA install UI)
   * - 'narrow': Mobile portrait (required for mobile PWA install UI)
   * - undefined: Works for mobile
   */
  form_factor?: 'wide' | 'narrow';
  /**
   * Label for the screenshot (accessibility)
   */
  label?: string;
}

export interface ManifestConfig {
  /**
   * Full name of the application
   */
  name: string;

  /**
   * Short name for the app icon
   * @default Same as name
   */
  shortName?: string;

  /**
   * Description of the application
   */
  description: string;

  /**
   * Start URL when the app is launched
   * @default '/'
   */
  startUrl?: string;

  /**
   * Display mode for the PWA
   * @default 'standalone'
   */
  display?: 'standalone' | 'fullscreen' | 'minimal-ui' | 'browser';

  /**
   * Preferred orientation
   * @default 'any'
   */
  orientation?: 'any' | 'portrait' | 'landscape';

  /**
   * Background color of the splash screen
   * @default '#ffffff'
   */
  backgroundColor?: string;

  /**
   * Theme color for the browser UI
   * @default '#000000'
   */
  themeColor?: string;

  /**
   * App icons for various sizes
   */
  icons: ManifestIcon[];

  /**
   * App categories for store listings
   * @default []
   */
  categories?: string[];

  /**
   * Screenshots for richer PWA install UI
   * Include at least one with form_factor: 'wide' for desktop
   * and one without form_factor (or 'narrow') for mobile
   */
  screenshots?: ManifestScreenshot[];
}

export type Manifest = MetadataRoute.Manifest;
