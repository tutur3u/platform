import type { Metadata } from 'next';
import { API_URL } from '@/constants/common';
import { siteConfig } from '@/constants/configs';
import { normalizeMarkdownToText } from '@/features/forms/content';
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

export async function fetchSharedFormData(
  shareCode: string,
  options?: {
    cookieHeader?: string;
  }
): Promise<SharedFormFetchResult> {
  const headers = options?.cookieHeader
    ? {
        cookie: options.cookieHeader,
      }
    : undefined;
  const response = await fetch(`${API_URL}/v1/shared/forms/${shareCode}`, {
    cache: 'no-store',
    headers,
  });

  if (!response.ok) {
    return {
      status: response.status,
      data: null,
    };
  }

  return {
    status: response.status,
    data: (await response.json()) as SharedFormPayload,
  };
}

function buildSharedFormUrl(locale: string, shareCode: string) {
  return `${siteConfig.url}/${locale}/shared/forms/${shareCode}`;
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
      description,
      kicker: strings.brand,
      coverImageUrl: '',
      accentColor: 'dynamic-green' as const,
      sectionCount: 0,
      questionCount: 0,
    };
  }

  const title =
    normalizeMarkdownToText(form.theme.coverHeadline || form.title) ||
    strings.fallbackTitle;
  const description =
    normalizeMarkdownToText(form.description) ||
    normalizeMarkdownToText(form.sections[0]?.description) ||
    strings.fallbackDescription;

  return {
    title,
    description,
    kicker: form.theme.coverKicker || strings.brand,
    coverImageUrl: form.theme.coverImage.url || '',
    accentColor: form.theme.accentColor,
    sectionCount: form.sections.length,
    questionCount: form.sections.reduce(
      (count, section) => count + section.questions.length,
      0
    ),
  };
}

export function buildSharedFormMetadata({
  locale,
  shareCode,
  form,
  strings,
  status = 200,
}: {
  locale: string;
  shareCode: string;
  form: FormDefinition | null | undefined;
  strings: SharedFormMetadataStrings;
  status?: number;
}): Metadata {
  const pageUrl = buildSharedFormUrl(locale, shareCode);
  const imageUrl = `${pageUrl}/opengraph-image`;
  const twitterImageUrl = `${pageUrl}/twitter-image`;
  const presentation = getSharedFormPresentation(form, strings, status);
  const title = `${presentation.title} | ${strings.brand}`;

  return {
    title,
    description: presentation.description,
    alternates: {
      canonical: pageUrl,
    },
    keywords: [
      presentation.title,
      strings.brand,
      'form',
      'survey',
      'shared form',
    ],
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
          alt: strings.openGraphAlt,
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
