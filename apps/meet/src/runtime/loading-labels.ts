/**
 * Route pending copy, duplicated from `messages/{en,vi}.json#meet.loading` so
 * the pending shell does not pull the full message bundles into the client.
 * `loading-labels.test.ts` keeps both in sync.
 */
export const loadingLabels = {
  en: {
    title: 'Meet',
    hint: 'Your next conversation starts here.',
    status: 'Getting things ready',
  },
  vi: {
    title: 'Meet',
    hint: 'Sẵn sàng cho cuộc trò chuyện tiếp theo.',
    status: 'Đang chuẩn bị',
  },
} as const;

export function readLoadingLabels(pathname: string) {
  return pathname.startsWith('/vi') ? loadingLabels.vi : loadingLabels.en;
}
