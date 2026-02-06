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

/// Returns the user's locale string for auth API calls.
String getLocale() {
  try {
    return Platform.localeName.split('.').first;
  } on Exception catch (_) {
    return 'en';
  }
}
