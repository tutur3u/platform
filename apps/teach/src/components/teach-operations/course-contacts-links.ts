import {
  getLaunchableApp,
  resolveLaunchableAppUrl,
} from '@tuturuuu/utils/launchable-apps';

const contacts = getLaunchableApp('contacts');

export function courseContactsLinks(wsId: string, courseId: string) {
  if (!contacts) return undefined;

  const workspacePath = `/${encodeURIComponent(wsId)}/users`;
  const resolve = (path: string) =>
    resolveLaunchableAppUrl({
      app: contacts,
      environment:
        process.env.NODE_ENV === 'production' ? 'production' : 'localhost',
      path,
    });

  return {
    group: resolve(`${workspacePath}/groups/${encodeURIComponent(courseId)}`),
    profile: (userId: string) =>
      resolve(`${workspacePath}/database/${encodeURIComponent(userId)}`),
  };
}
