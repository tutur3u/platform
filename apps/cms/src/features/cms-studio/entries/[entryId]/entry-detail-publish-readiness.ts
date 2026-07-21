export type EntryPublishReadinessCheckId =
  | 'content'
  | 'cover'
  | 'slug'
  | 'title';

export type EntryPublishReadinessCheck = {
  complete: boolean;
  id: EntryPublishReadinessCheckId;
};

export type EntryPublishReadiness = {
  completeCount: number;
  isComplete: boolean;
  items: EntryPublishReadinessCheck[];
  totalCount: number;
};

function isMeaningfulValue(value: unknown): boolean {
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  if (Array.isArray(value)) {
    return value.some(isMeaningfulValue);
  }

  if (value && typeof value === 'object') {
    return Object.values(value).some(isMeaningfulValue);
  }

  return value !== null && value !== undefined && value !== false;
}

export function hasMeaningfulStructuredContent(
  ...records: Record<string, unknown>[]
): boolean {
  return records.some((record) =>
    Object.values(record).some(isMeaningfulValue)
  );
}

export function getEntryPublishReadiness({
  bodyMarkdown,
  coverRecommended,
  hasCover,
  hasStructuredContent,
  slug,
  summary,
  title,
}: {
  bodyMarkdown: string;
  coverRecommended: boolean;
  hasCover: boolean;
  hasStructuredContent: boolean;
  slug: string;
  summary: string | null;
  title: string;
}): EntryPublishReadiness {
  const items: EntryPublishReadinessCheck[] = [
    { complete: title.trim().length > 0, id: 'title' },
    { complete: slug.trim().length > 0, id: 'slug' },
    {
      complete:
        Boolean(summary?.trim()) ||
        bodyMarkdown.trim().length > 0 ||
        hasStructuredContent,
      id: 'content',
    },
  ];

  if (coverRecommended) {
    items.push({ complete: hasCover, id: 'cover' });
  }

  const completeCount = items.filter((item) => item.complete).length;

  return {
    completeCount,
    isComplete: completeCount === items.length,
    items,
    totalCount: items.length,
  };
}
