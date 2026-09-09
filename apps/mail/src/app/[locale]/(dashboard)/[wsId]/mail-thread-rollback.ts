import type { InfiniteData } from '@tanstack/react-query';
import type { MailThreadsResponse } from '@tuturuuu/internal-api';

// Restore only this operation's conversations. Other successful/pending actions
// must survive a failed archive, even when their snapshots overlap.
export function restoreThreadPages(
  current: InfiniteData<MailThreadsResponse> | undefined,
  before: InfiniteData<MailThreadsResponse> | undefined,
  ids: Set<string>
) {
  if (!current || !before) return current;
  const existingIds = new Set(
    current.pages.flatMap((page) => page.threads.map((thread) => thread.id))
  );
  const restoredIds = new Set<string>();
  const originals = new Map(
    before.pages.flatMap((page) =>
      page.threads
        .filter((thread) => ids.has(thread.id))
        .map((thread) => [thread.id, thread] as const)
    )
  );
  const pages = current.pages.map((page, pageIndex) => {
    const threads = page.threads.map(
      (thread) => originals.get(thread.id) ?? thread
    );
    const originalPage = before.pages[pageIndex];
    for (const [index, thread] of (originalPage?.threads ?? []).entries()) {
      if (
        !ids.has(thread.id) ||
        existingIds.has(thread.id) ||
        restoredIds.has(thread.id)
      )
        continue;
      const next = originalPage?.threads
        .slice(index + 1)
        .find((candidate) => threads.some((row) => row.id === candidate.id));
      const previous = originalPage?.threads
        .slice(0, index)
        .reverse()
        .find((candidate) => threads.some((row) => row.id === candidate.id));
      const position = next
        ? threads.findIndex((row) => row.id === next.id)
        : previous
          ? threads.findIndex((row) => row.id === previous.id) + 1
          : Math.min(index, threads.length);
      threads.splice(position, 0, thread);
      restoredIds.add(thread.id);
    }
    return { ...page, threads };
  });
  return {
    ...current,
    pages: pages.map((page) => ({
      ...page,
      pagination: {
        ...page.pagination,
        total:
          page.pagination.total === null
            ? null
            : page.pagination.total + restoredIds.size,
      },
    })),
  };
}
