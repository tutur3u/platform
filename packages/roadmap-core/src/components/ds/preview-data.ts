import {
  buildFeatures,
  type PreviewManifest,
} from '../../content/feature-previews';

// One manifest per capture source (app, web); a source that has not been
// captured yet is simply absent.
const manifests = import.meta.glob<PreviewManifest>(
  '../../assets/previews/*/manifest.json',
  { eager: true, import: 'default' }
);
const urls = import.meta.glob<string>(
  '../../assets/previews/*/*/*.{avif,webp}',
  { eager: true, import: 'default', query: '?no-inline' }
);

const bySource = (source: 'app' | 'web') =>
  manifests[`../../assets/previews/${source}/manifest.json`];

/** Manifest paths are repo-relative; the glob keys are module-relative. */
const resolve = (file: string) =>
  file.replace(/^packages\/roadmap-core\/src\//, '../../');

export const FEATURES = buildFeatures(
  { app: bySource('app'), web: bySource('web') },
  urls,
  resolve
);
