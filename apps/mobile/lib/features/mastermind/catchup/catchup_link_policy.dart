/// The only hosts a catch-up link may open: `tuturuuu.com` and its
/// subdomains over plain https. Anything else is dropped, never opened.
const _allowedHost = 'tuturuuu.com';

Uri? safeCatchupUri(Object? raw) {
  if (raw is! String || raw.length > 2048) return null;
  final uri = Uri.tryParse(raw.trim());
  if (uri == null ||
      uri.scheme != 'https' ||
      uri.userInfo.isNotEmpty ||
      (uri.hasPort && uri.port != 443)) {
    return null;
  }
  // Uri lower-cases the host; a trailing dot would make it a different name.
  final host = uri.host;
  final allowed = host == _allowedHost || host.endsWith('.$_allowedHost');
  return allowed ? uri : null;
}
