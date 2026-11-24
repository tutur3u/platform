import { lazy, Suspense, useEffect, useState } from 'react';
import type { Lang, Messages } from './shared';

// The previews, their manifests and image URLs are a separate chunk.
const FeaturePreviewsSection = lazy(() => import('./feature-previews-section'));

/**
 * Mounts the feature previews after hydration only. The page renders every
 * Suspense boundary complete on the server, so a lazy section must never
 * render there; the server and the first client render both leave this slot
 * empty.
 */
export function FeaturePreviewsSlot(props: {
  lang: Lang;
  t: Messages['featurePreviews'];
}) {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  if (!hydrated) return null;
  return (
    <Suspense fallback={null}>
      <FeaturePreviewsSection {...props} />
    </Suspense>
  );
}
