import {
  type UpskiiContentItem,
  upskiiContentErrorCode,
} from '@tuturuuu/internal-api/upskii-content';
import type { UpskiiPresentationItem } from '@tuturuuu/realtime/meet/room-upskii-presentation';

/**
 * One Upskii list (classes, or one class's lessons or assessments) as the
 * picker shows it. Exactly one applies; refusals the account can fix are
 * named apart from failures a retry might fix.
 */
export type UpskiiListState =
  | { kind: 'loading' }
  | { kind: 'unlinked' }
  | { kind: 'early_access' }
  | { kind: 'scope' }
  | { kind: 'error'; retrying: boolean }
  | { kind: 'empty' }
  | {
      kind: 'ready';
      items: UpskiiContentItem[];
      hasMore: boolean;
      loadingMore: boolean;
    };

export function upskiiListState(query: {
  isPending: boolean;
  isFetching: boolean;
  error: unknown;
  items: UpskiiContentItem[] | undefined;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
}): UpskiiListState {
  if (query.items?.length)
    return {
      kind: 'ready',
      items: query.items,
      hasMore: query.hasNextPage,
      loadingMore: query.isFetchingNextPage,
    };
  if (query.error) {
    switch (upskiiContentErrorCode(query.error)) {
      case 'NOT_LINKED':
        return { kind: 'unlinked' };
      case 'EARLY_ACCESS_ONLY':
        return { kind: 'early_access' };
      case 'SCOPE_NOT_GRANTED':
        return { kind: 'scope' };
      default:
        return { kind: 'error', retrying: query.isFetching };
    }
  }
  if (query.isPending) return { kind: 'loading' };
  return { kind: 'empty' };
}

/** A refusal that only changes when the account link does; never retried. */
export function isSettledUpskiiRefusal(error: unknown) {
  const code = upskiiContentErrorCode(error);
  return (
    code === 'NOT_LINKED' ||
    code === 'EARLY_ACCESS_ONLY' ||
    code === 'SCOPE_NOT_GRANTED' ||
    code === 'CLASS_NOT_FOUND'
  );
}

/**
 * What the room receives for an item: its label and its already-checked link.
 * The room checks the link again; classes are not presentable.
 */
export function toPresentationItem(
  item: UpskiiContentItem,
  classTitle?: string
): UpskiiPresentationItem | null {
  if (item.kind === 'class') return null;
  return {
    kind: item.kind,
    id: item.id,
    title: item.title,
    ...(classTitle ? { classTitle: classTitle.slice(0, 120) } : {}),
    url: item.url,
  };
}

/** The host and path a projector shows under the QR code, without the query. */
export function displayUpskiiLink(url: string) {
  const parsed = new URL(url);
  const path = parsed.pathname === '/' ? '' : parsed.pathname;
  const shown = `${parsed.host}${path}`;
  return shown.length > 60 ? `${shown.slice(0, 59)}…` : shown;
}
