import type { JSONContent } from '@tuturuuu/types/tiptap';

export type ChangelogEntry = {
  category: string;
  content?: JSONContent | null;
  cover_image_url: string | null;
  created_at?: string | null;
  id: string;
  published_at: string | null;
  slug: string;
  summary: string | null;
  title: string;
  version: string | null;
};

export type ChangelogListResponse = {
  data: ChangelogEntry[];
  pagination: {
    page: number | null;
    pageSize: number | null;
    total: number;
    totalPages: number | null;
  };
};

export type ChangelogAdjacentEntry = {
  slug: string;
  title: string;
};

export type ChangelogEntryPageData = {
  changelog: ChangelogEntry;
  next: ChangelogAdjacentEntry | null;
  previous: ChangelogAdjacentEntry | null;
};

export type ChangelogCopy = {
  badge: string;
  backToChangelog: string;
  ctaButton: string;
  ctaDescription: string;
  ctaTitle: string;
  feedbackButton: string;
  feedbackDescription: string;
  feedbackTitle: string;
  heroDescription: string;
  heroTitle: string;
  next: string;
  noUpdates: string;
  noUpdatesDescription: string;
  previous: string;
  readMore: string;
  update: string;
  updates: string;
};
