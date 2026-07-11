export const DEFAULT_MAIL_PANE_LAYOUT = [38, 62] as const;

let currentMailPaneLayout: [number, number] | null = null;

const MIN_THREAD_LIST_PERCENT = 28;
const MAX_THREAD_LIST_PERCENT = 48;
const MIN_THREAD_DETAIL_PERCENT = 45;

export function normalizeMailPaneLayout(value: unknown): [number, number] {
  if (!Array.isArray(value) || value.length !== 2) {
    return [...DEFAULT_MAIL_PANE_LAYOUT];
  }

  const [threadList, threadDetail] = value;
  if (
    typeof threadList !== 'number' ||
    typeof threadDetail !== 'number' ||
    !Number.isFinite(threadList) ||
    !Number.isFinite(threadDetail) ||
    threadList < MIN_THREAD_LIST_PERCENT ||
    threadList > MAX_THREAD_LIST_PERCENT ||
    threadDetail < MIN_THREAD_DETAIL_PERCENT ||
    Math.abs(threadList + threadDetail - 100) > 0.5
  ) {
    return [...DEFAULT_MAIL_PANE_LAYOUT];
  }

  return [threadList, threadDetail];
}

export function getCurrentMailPaneLayout() {
  return currentMailPaneLayout
    ? ([...currentMailPaneLayout] as [number, number])
    : ([...DEFAULT_MAIL_PANE_LAYOUT] as [number, number]);
}

export function setCurrentMailPaneLayout(value: unknown) {
  currentMailPaneLayout = normalizeMailPaneLayout(value);
  return [...currentMailPaneLayout] as [number, number];
}
