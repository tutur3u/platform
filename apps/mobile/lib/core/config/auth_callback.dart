/// Desktop package metadata may contain an executable name (Windows/Linux)
/// instead of a bundle identifier. Never derive the callback from that name.
String authCallbackUrl(String packageName) {
  final name = packageName.trim();
  final scheme =
      RegExp(r'^com\.tuturuuu\.app\.mobile(?:\.dev|\.stg)?$').hasMatch(name)
      ? name
      : 'com.tuturuuu.app.mobile';
  return '$scheme://login-callback';
}
