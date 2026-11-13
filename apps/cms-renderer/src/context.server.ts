import { AsyncLocalStorage } from 'node:async_hooks';
import type { PublishedPage } from './worker';
export const pageContext = new AsyncLocalStorage<PublishedPage>();
export function currentPage() {
  const page = pageContext.getStore();
  if (!page) throw new Error('Published page context unavailable');
  return page;
}
