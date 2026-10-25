import { matchPage } from '@tuturuuu/start-bridge/pages';
import { type PagePattern, pages } from './page-registry.bridge.gen';

const pageKinds = {
  '/': 'public-plans',
  '/plans/[planId]': 'plan',
  '/login': 'login',
  '/verify-token': 'verify-token',
  '/[wsId]/meetings/[meetingId]': 'meeting',
  '/[wsId]/meetings': 'meetings',
  '/[wsId]': 'workspace',
  '/[wsId]/plans': 'workspace-plans',
  '/native-collaboration': 'native-collaboration',
  '/r/[code]': 'room',
} as const satisfies Record<PagePattern, string>;

export function matchMeetPage(pathname: string) {
  const segments = pathname.split('/').filter(Boolean);
  const locale =
    segments[0] === 'en' || segments[0] === 'vi' ? segments.shift() : undefined;
  const page = matchPage(pages, `/${segments.join('/')}`);
  if (!page) return null;
  return { kind: pageKinds[page.page.pattern], locale, segments };
}
