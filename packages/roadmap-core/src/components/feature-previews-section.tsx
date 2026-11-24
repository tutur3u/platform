import { FEATURES } from './ds/preview-data';
import { FeaturePreviews } from './feature-previews';
import type { Lang, Messages } from './shared';

/**
 * The Releases tab's previews with their manifests and image URLs, loaded as
 * their own chunk so the page's main bundle does not carry them. Renders
 * nothing while no capture manifest exists.
 */
export default function FeaturePreviewsSection(props: {
  lang: Lang;
  t: Messages['featurePreviews'];
}) {
  if (!FEATURES.length) return null;
  return <FeaturePreviews features={FEATURES} {...props} />;
}
