import 'dart:io';

/// Fixed, non-sensitive receipt proving the real platform link stream fired.
/// Does not accept credentials, choose a file path, or authenticate a session.
Future<bool> recordDesktopSmokeUri(Uri uri) async {
  if (!Platform.isWindows ||
      uri.scheme != 'com.tuturuuu.app.mobile' ||
      uri.host != 'login-callback' ||
      uri.query != 'desktop_smoke=1' ||
      uri.fragment.isNotEmpty) {
    return false;
  }
  final local = Platform.environment['LOCALAPPDATA'];
  if (local == null) return true;
  try {
    final file = File('$local/Tuturuuu/desktop-smoke.txt');
    await file.parent.create(recursive: true);
    await file.writeAsString('desktop_smoke=1', flush: true);
  } on FileSystemException {
    // A validation receipt must never break normal link handling.
  }
  return true;
}
