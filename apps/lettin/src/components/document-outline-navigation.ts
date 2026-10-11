/** Entry IDs come from the published projection, never the raw query selection. */
export function outlineHeadingHref(id: string, publicEntryId?: string | null) {
  const fragment = `#${encodeURIComponent(id)}`;
  if (publicEntryId === undefined) return fragment;
  return `${publicEntryId === null ? '?' : `?entry=${encodeURIComponent(publicEntryId)}`}${fragment}`;
}

export function focusOutlineHeading(article: HTMLElement | null, id: string) {
  const target = [
    ...(article?.querySelectorAll<HTMLElement>('[data-lettin-heading]') ?? []),
  ].find((heading) => heading.id === id);
  if (!target) return false;
  for (
    let parent = target.parentElement;
    parent && parent !== article;
    parent = parent.parentElement
  ) {
    if (parent instanceof HTMLDetailsElement) parent.open = true;
  }
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: 'start', behavior: 'auto' });
  return true;
}

export function decodedOutlineFragment(hash: string) {
  try {
    return decodeURIComponent(hash.slice(1));
  } catch {
    return '';
  }
}
