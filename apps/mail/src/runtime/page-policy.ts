import { matchPage } from '@tuturuuu/start-bridge/pages';
import { routeParam } from '@tuturuuu/start-bridge/route-match';
import { isMailFolder } from '../app/[locale]/(dashboard)/[wsId]/mail-folders';
import { type PagePattern, pages } from './page-registry.bridge.gen';

const pageKinds = {
  '/': 'home',
  '/login': 'login',
  '/verify-token': 'verify-token',
  '/not-available': 'not-available',
  '/[wsId]': 'workspace-index',
  '/[wsId]/archive': 'folder',
  '/[wsId]/drafts': 'folder',
  '/[wsId]/inbox': 'folder',
  '/[wsId]/muted': 'folder',
  '/[wsId]/sent': 'folder',
  '/[wsId]/snoozed': 'folder',
  '/[wsId]/spam': 'folder',
  '/[wsId]/starred': 'folder',
  '/[wsId]/trash': 'folder',
} satisfies Record<
  PagePattern,
  | 'home'
  | 'login'
  | 'verify-token'
  | 'not-available'
  | 'workspace-index'
  | 'folder'
>;

export function resolveMailPage(pathname: string) {
  const segments = pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const locale = segments[0] === 'vi' ? 'vi' : 'en';
  const localized = segments[0] === 'en' || segments[0] === 'vi';
  // Keep encoded segment boundaries intact for the bridge's single decode.
  const raw = pathname.split('/').filter(Boolean);
  if (localized) raw.shift();
  const matched = matchPage(pages, `/${raw.join('/')}`);
  if (!matched) return { kind: 'missing' as const, locale };
  const kind = pageKinds[matched.page.pattern];
  switch (kind) {
    case 'home':
    case 'login':
    case 'verify-token':
    case 'not-available':
      return { kind, locale };
    case 'workspace-index':
      return { kind, locale, wsId: routeParam(matched.params, 'wsId') };
    case 'folder': {
      const folder = segments.at(-1);
      if (!folder || !isMailFolder(folder))
        return { kind: 'missing' as const, locale };
      return { kind, locale, wsId: routeParam(matched.params, 'wsId'), folder };
    }
    default: {
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}
