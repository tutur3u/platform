import 'package:flutter/services.dart';

/// Answers `MainActivity`'s `hasModal` query on `mobile/shell_back`.
///
/// On exit routes (`/`, `/apps`) Android would otherwise show the exit toast
/// or close the app even while a sheet or dialog is open. The activity asks
/// first; when Flutter reports an open overlay it forwards Back to Flutter,
/// which closes the topmost overlay.
abstract final class AndroidModalBackBridge {
  static const channel = MethodChannel('mobile/shell_back');

  static bool Function()? _probe;

  /// Installs [hasModal] as the current probe. The latest caller wins.
  static void install(bool Function() hasModal) {
    _probe = hasModal;
    channel.setMethodCallHandler(_handle);
  }

  /// Removes [hasModal] if it is still the installed probe (tear-offs of the
  /// same method compare equal).
  static void uninstall(bool Function() hasModal) {
    if (_probe != hasModal) return;
    _probe = null;
    channel.setMethodCallHandler(null);
  }

  static Future<Object?> _handle(MethodCall call) async =>
      switch (call.method) {
        'hasModal' => _probe?.call() ?? false,
        _ => throw MissingPluginException(call.method),
      };
}
