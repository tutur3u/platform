/**
 * Web pages that live under a mounted app's base and stay with the web
 * families although the gateway lists `<base>/*`. An entry covers the path and
 * its subtree on segment boundaries; the mounted app never receives it.
 */
const WEB_OWNED_MOUNT_SUBPATHS: readonly string[] = [
  // Publicly shared AI chat pages, linked from Web and Rewise.
  '/ai/chats',
];

export function isWebOwnedMountPath(pathname: string) {
  return WEB_OWNED_MOUNT_SUBPATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}
