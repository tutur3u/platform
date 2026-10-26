export const MEETING_APP =
  process.env.NEXT_PUBLIC_MEETING_APP === 'parley' ? 'parley' : 'meet';

interface MeetingUrls {
  path(path: string): string;
  absolute(path: string, origin?: string | URL): string;
}

let urls: MeetingUrls = {
  path: (path) => path,
  absolute: (path, origin) =>
    new URL(path, origin ?? 'https://meet.tuturuuu.com').toString(),
};

export function configureMeetingUrls(resolver: MeetingUrls) {
  urls = resolver;
}

export function meetingAppPath(path: string) {
  return urls.path(path);
}

export function meetingAppUrl(path: string, origin?: string | URL) {
  return urls.absolute(path, origin);
}
