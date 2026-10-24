import { isNavigableDestination } from '../link/destination';

/** Full-page navigation to a verified destination; script URLs are refused. */
export function leaveFor(url: unknown) {
  if (typeof url !== 'string' || !isNavigableDestination(url)) return false;
  window.location.assign(url);
  return true;
}
