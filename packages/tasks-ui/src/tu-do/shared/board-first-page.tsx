import type { Task } from '@tuturuuu/types/primitives/Task';

/**
 * Tasks per list page. The board page's server snapshot reads the first page
 * at this size and the progressive loader continues from it, so both must
 * share one value or pagination drifts.
 */
export const BOARD_LIST_PAGE_SIZE = 50;

/** One list's first page, as read during the server render. */
export interface BoardFirstListPage {
  tasks: Task[];
  count: number | null;
}
