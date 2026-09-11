import { supportedLocales } from '@/i18n/routing';

export function resolveMeetWorkspacePath({
  currentPathname,
  nextSlug,
}: {
  currentPathname: string;
  nextSlug: string;
}) {
  const segments = currentPathname.split('/').filter(Boolean);
  const index = supportedLocales.some((locale) => locale === segments[0])
    ? 1
    : 0;
  if (segments[index] === 'workspace') segments.splice(index, 1);
  segments[index] = nextSlug;
  return `/${segments.join('/')}`;
}
