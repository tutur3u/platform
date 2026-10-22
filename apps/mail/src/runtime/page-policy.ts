import { isMailFolder } from '../app/[locale]/(dashboard)/[wsId]/mail-folders';
export function resolveMailPage(pathname: string) {
  const segments = pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const locale = segments[0] === 'vi' ? 'vi' : 'en';
  if (segments[0] === 'en' || segments[0] === 'vi') segments.shift();
  if (segments.length === 0) return { kind: 'home' as const, locale };
  const [first, folder] = segments;
  if (segments.length === 1 && first === 'login')
    return { kind: 'login' as const, locale };
  if (segments.length === 1 && first === 'verify-token')
    return { kind: 'verify-token' as const, locale };
  if (segments.length === 1 && first === 'not-available')
    return { kind: 'not-available' as const, locale };
  if (first && segments.length === 1)
    return { kind: 'workspace-index' as const, locale, wsId: first };
  if (first && folder && segments.length === 2 && isMailFolder(folder))
    return { kind: 'folder' as const, locale, wsId: first, folder };
  return { kind: 'missing' as const, locale };
}
