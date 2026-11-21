import 'dart:io' show Platform;

import 'package:device_info_plus/device_info_plus.dart';

/// Retrieves a device identifier for auth API calls.
///
/// iOS: identifierForVendor
/// Android: Android ID
Future<String?> getDeviceId() async {
  try {
    final deviceInfo = DeviceInfoPlugin();
    if (Platform.isIOS) {
      final ios = await deviceInfo.iosInfo;
      return ios.identifierForVendor;
    }
    if (Platform.isAndroid) {
      final android = await deviceInfo.androidInfo;
      return android.id;
    }
    return null;
  } on Exception catch (_) {
    return null;
  }
}

/// Whether this iOS build runs on an Apple silicon Mac ("Designed for iPad").
///
/// Native Google Sign-In is not supported there, so callers route Google
/// through browser OAuth like the macOS desktop build.
Future<bool> isIOSAppOnMac() => _isIOSAppOnMac ??= _detectIOSAppOnMac();

Future<bool>? _isIOSAppOnMac;

Future<bool> _detectIOSAppOnMac() async {
  if (!Platform.isIOS) return false;
  try {
    final ios = await DeviceInfoPlugin().iosInfo;
    return ios.isiOSAppOnMac;
  } on Exception catch (_) {
    return false;
  }
}

/// Returns the user's locale string for auth API calls.
String getLocale() {
  try {
    return Platform.localeName.split('.').first;
  } on Exception catch (_) {
    return 'en';
  }
}
