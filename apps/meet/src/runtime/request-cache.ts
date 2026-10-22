import { meetRequest } from './request-context';

export function revalidatePath(_path: string, _type?: 'page' | 'layout') {
  // Native Start has no persistent Next rendering cache. Every successful
  // transport also invalidates the current native route in the browser.
  meetRequest().responseHeaders.set('Cache-Control', 'private, no-store');
}
