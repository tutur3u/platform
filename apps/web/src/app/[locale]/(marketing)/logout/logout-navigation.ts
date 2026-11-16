export function navigateFromLogout(href: string) {
  // Drop cached browser auth state after the server changes the session cookies.
  window.location.assign(href);
}
