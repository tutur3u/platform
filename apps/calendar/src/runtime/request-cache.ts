import { calendarRequest } from './request-context';

export function revalidatePath(_path: string, _type?: 'page' | 'layout') {
  // Native Start has no persistent Next rendering cache. Every successful
  // transport also invalidates the current native route in the browser.
  calendarRequest().responseHeaders.set('Cache-Control', 'private, no-store');
}
