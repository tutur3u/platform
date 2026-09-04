import type { FormSeoInput } from './schema';

/**
 * Resolution of a form's SEO overrides against the values derived from its
 * content.
 *
 * Every override is optional and an empty value means "keep the derived one",
 * so a form that was created before the SEO panel existed — or one whose author
 * never opened it — behaves exactly as it did before.
 */

export interface DerivedFormSeo {
  /** Title derived from the cover headline or the form title. */
  title: string;
  /** Description derived from the form or its first non-empty section. */
  description: string;
  /** Keywords derived from the title and brand. */
  keywords: string[];
}

export interface ResolvedFormSeo {
  title: string;
  description: string;
  /**
   * An uploaded social card, or `null` to fall back to the card this app
   * renders at `/f/<shareCode>/opengraph-image`.
   */
  imageUrl: string | null;
  imageAlt: string;
  keywords: string[];
  /** Overrides the canonical URL; `null` keeps the form's own public URL. */
  canonicalUrl: string | null;
  noIndex: boolean;
}

const EMPTY_SEO: FormSeoInput = {
  title: '',
  description: '',
  image: { storagePath: '', url: '', alt: '' },
  keywords: [],
  canonicalUrl: '',
  noIndex: false,
};

function firstNonEmpty(...values: (string | null | undefined)[]) {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return '';
}

export function resolveFormSeo({
  seo,
  derived,
  fallbackImageAlt,
}: {
  seo: FormSeoInput | null | undefined;
  derived: DerivedFormSeo;
  /** Used when an uploaded card carries no alt text of its own. */
  fallbackImageAlt: string;
}): ResolvedFormSeo {
  const overrides = seo ?? EMPTY_SEO;

  return {
    title: firstNonEmpty(overrides.title, derived.title),
    description: firstNonEmpty(overrides.description, derived.description),
    // Only a resolved URL is usable here. A storage path with no signed URL
    // means the media resolver could not sign it, and emitting the raw path
    // would produce a broken social card rather than falling back to the
    // generated one.
    imageUrl: overrides.image.url.trim() || null,
    imageAlt: firstNonEmpty(overrides.image.alt, fallbackImageAlt),
    keywords: overrides.keywords.length ? overrides.keywords : derived.keywords,
    canonicalUrl: overrides.canonicalUrl.trim() || null,
    noIndex: overrides.noIndex,
  };
}

/**
 * True when the author has customised anything at all — used by the studio to
 * show an "in use" badge without re-deriving each field.
 */
export function hasFormSeoOverrides(seo: FormSeoInput | null | undefined) {
  if (!seo) {
    return false;
  }

  return Boolean(
    seo.title.trim() ||
      seo.description.trim() ||
      seo.image.url.trim() ||
      seo.image.storagePath.trim() ||
      seo.keywords.length ||
      seo.canonicalUrl.trim() ||
      seo.noIndex
  );
}
