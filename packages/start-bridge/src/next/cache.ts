import { bridgeRequest } from '../server/request-context';

export function revalidatePath(_path: string, _type?: 'page' | 'layout') {
  // Native Start has no persistent Next rendering cache. Every successful
  // transport also invalidates the current native route in the browser.
  bridgeRequest().responseHeaders.set('Cache-Control', 'private, no-store');
}

export function revalidateTag(_tag: string) {
  bridgeRequest().responseHeaders.set('Cache-Control', 'private, no-store');
}
