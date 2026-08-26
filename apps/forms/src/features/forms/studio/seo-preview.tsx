'use client';

import { Globe2 } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import { normalizeMarkdownToText } from '../content';

/** Roughly where Google truncates a result title and snippet. */
const TITLE_DISPLAY_LIMIT = 60;
const DESCRIPTION_DISPLAY_LIMIT = 160;

function clampForDisplay(value: string, limit: number) {
  const normalized = normalizeMarkdownToText(value).replace(/\s+/g, ' ').trim();

  if (normalized.length <= limit) {
    return { text: normalized, truncated: false };
  }

  return {
    text: `${normalized.slice(0, limit - 1).trimEnd()}…`,
    truncated: true,
  };
}

/**
 * Approximate search-result preview for the public form page.
 *
 * Deliberately shows the *resolved* values — an empty SEO override falls back
 * to the form's own title and description — so an author who has customised
 * nothing still sees what a crawler would, rather than an empty box. The
 * truncation marks are the point of the component: they make an over-long
 * title visibly get cut before it is published rather than after.
 */
export function SearchResultPreview({
  description,
  fallbackDescription,
  fallbackTitle,
  shareCode,
  title,
}: {
  description: string;
  fallbackDescription: string;
  fallbackTitle: string;
  shareCode?: string | null;
  title: string;
}) {
  const t = useTranslations('forms');

  const origin =
    typeof window === 'undefined'
      ? ''
      : window.location.origin.replace(/^https?:\/\//, '');
  const displayUrl = shareCode
    ? `${origin}/f/${shareCode}`
    : t('settings.seo_preview_unpublished_url');

  const resolvedTitle = clampForDisplay(
    title || fallbackTitle,
    TITLE_DISPLAY_LIMIT
  );
  const resolvedDescription = clampForDisplay(
    description || fallbackDescription,
    DESCRIPTION_DISPLAY_LIMIT
  );

  return (
    <div className="space-y-2 rounded-[1.35rem] border border-border/60 bg-background/55 p-4">
      <p className="text-[11px] text-muted-foreground uppercase tracking-[0.24em]">
        {t('settings.seo_preview')}
      </p>

      <div className="space-y-1">
        <p className="flex items-center gap-1.5 text-muted-foreground text-xs">
          <Globe2 className="h-3 w-3 shrink-0" />
          <span className="truncate">{displayUrl}</span>
        </p>
        <p className="font-medium text-base text-dynamic-blue leading-snug">
          {resolvedTitle.text}
        </p>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {resolvedDescription.text}
        </p>
      </div>

      {resolvedTitle.truncated || resolvedDescription.truncated ? (
        <p className="text-dynamic-orange text-xs">
          {t('settings.seo_preview_truncated')}
        </p>
      ) : null}
    </div>
  );
}
