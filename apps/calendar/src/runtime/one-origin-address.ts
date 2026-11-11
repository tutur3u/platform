export function canonicalCalendarAddress(location: {
  pathname: string;
  search: string;
  hash: string;
}): string | null {
  return location.pathname === '/calendar/'
    ? `/calendar${location.search}${location.hash}`
    : null;
}
