import { NO_INDEX_ROBOTS } from '@tuturuuu/utils/common/metadata';
import type { Metadata } from 'next';
import { siteConfig } from '@/constants/configs';
import { normalizeMarkdownToText } from '@/features/forms/content';
import { resolveFormSeo } from '@/features/forms/shared-form-seo';
import type {
  FormAnswerValue,
  FormDefinition,
  FormReadOnlyAnswerIssue,
} from '@/features/forms/types';

export interface SharedFormPayload {
  form: FormDefinition;
  sessionId?: string;
  readOnly?: boolean;
  initialAnswers?: Record<string, FormAnswerValue>;
  answerIssues?: FormReadOnlyAnswerIssue[];
  submittedAt?: string | null;
  responseCopyEmail?: string | null;
  readOnlyResponseId?: string | null;
  readOnlyResponseSessionId?: string | null;
  canRequestResponseCopy?: boolean;
  responseCopyAlreadySent?: boolean;
}

export interface SharedFormFetchResult {
  status: number;
  data: SharedFormPayload | null;
}

export interface SharedFormMetadataStrings {
  brand: string;
  fallbackTitle: string;
  fallbackDescription: string;
  protectedDescription: string;
  unavailableDescription: string;
  openGraphAlt: string;
}

/**
 * Public shared forms live at `forms.tuturuuu.com/f/<shareCode>`.
 *
 * There is no locale segment: the forms app routes with
 * `localePrefix: 'never'`, so the canonical URL is locale-less. apps/web keeps
 * a permanent redirect from the legacy `/<locale>/shared/forms/<shareCode>`
 * path so previously shared links (and their cached social cards) keep working.
 */
function buildSharedFormUrl(shareCode: string) {
  return `${siteConfig.url}/f/${shareCode}`;
}

function clampSocialText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, ' ').trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function getSharedFormPresentation(
  form: FormDefinition | null | undefined,
  strings: SharedFormMetadataStrings,
  status = 200
) {
  if (!form) {
    const description =
      status === 401
        ? strings.protectedDescription
        : status === 404 || status === 410
          ? strings.unavailableDescription
          : strings.fallbackDescription;

    return {
      title: strings.fallbackTitle,
      description: clampSocialText(description, 160),
      coverImageUrl: '',
      coverImagePath: '',
      accentColor: 'dynamic-green' as const,
      sectionCount: 0,
      itemCount: 0,
      // A form that could not be loaded must never be indexed: the page the
      // crawler sees is an error state, not the form.
      seo: {
        canonicalUrl: null,
        imageAlt: strings.openGraphAlt,
        imageUrl: null,
        keywords: [],
        noIndex: true,
      },
    };
  }

  const title =
    normalizeMarkdownToText(form.theme.coverHeadline || form.title) ||
    strings.fallbackTitle;

  const firstSectionDescription =
    form.sections
      .map((section) => normalizeMarkdownToText(section.description))
      .find((value) => value.trim().length > 0) ?? '';

  const description =
    normalizeMarkdownToText(form.description) ||
    firstSectionDescription ||
    strings.fallbackDescription;

  const itemCount = form.sections.reduce(
    (count, section) =>
      count +
      section.questions.filter((question) => question.type !== 'divider')
        .length,
    0
  );

  const resolved = resolveFormSeo({
    derived: {
      description,
      keywords: [title, strings.brand, 'form', 'survey', 'shared form'],
      title,
    },
    fallbackImageAlt: strings.openGraphAlt,
    seo: form.seo,
  });

  return {
    title: clampSocialText(resolved.title, 90),
    description: clampSocialText(resolved.description, 160),
    coverImageUrl: form.theme.coverImage.url || '',
    coverImagePath: form.theme.coverImage.storagePath || '',
    accentColor: form.theme.accentColor,
    sectionCount: form.sections.length,
    itemCount,
    seo: {
      canonicalUrl: resolved.canonicalUrl,
      imageAlt: resolved.imageAlt,
      imageUrl: resolved.imageUrl,
      keywords: resolved.keywords,
      noIndex: resolved.noIndex,
    },
  };
}

export function buildSharedFormMetadata({
  shareCode,
  form,
  strings,
  status = 200,
}: {
  shareCode: string;
  form: FormDefinition | null | undefined;
  strings: SharedFormMetadataStrings;
  status?: number;
}): Metadata {
  const pageUrl = buildSharedFormUrl(shareCode);
  const presentation = getSharedFormPresentation(form, strings, status);
  // An uploaded card replaces both the Open Graph and Twitter images. Falling
  // back per-network would show two different previews for the same link.
  const imageUrl = presentation.seo.imageUrl ?? `${pageUrl}/opengraph-image`;
  const twitterImageUrl =
    presentation.seo.imageUrl ?? `${pageUrl}/twitter-image`;

  // An author-supplied title is used verbatim. The item count and brand suffix
  // exist to make a derived title informative; appending them to deliberate
  // copy would just eat the characters a social card has room for.
  const title = form?.seo?.title?.trim()
    ? presentation.title
    : presentation.itemCount > 0
      ? `${presentation.title} (${presentation.itemCount} items) | ${strings.brand}`
      : `${presentation.title} | ${strings.brand}`;

  return {
    title,
    description: presentation.description,
    alternates: {
      canonical: presentation.seo.canonicalUrl ?? pageUrl,
    },
    keywords: presentation.seo.keywords,
    ...(presentation.seo.noIndex ? { robots: NO_INDEX_ROBOTS } : {}),
    openGraph: {
      type: 'website',
      url: pageUrl,
      title,
      description: presentation.description,
      siteName: strings.brand,
      images: [
        {
          url: imageUrl,
          width: 1200,
          height: 630,
          alt: presentation.seo.imageAlt || strings.openGraphAlt,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: presentation.description,
      images: [twitterImageUrl],
      creator: '@tuturuuu',
    },
  };
}
