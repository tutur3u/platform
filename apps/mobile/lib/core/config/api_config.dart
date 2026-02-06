import 'dart:io' show Platform;

import 'package:mobile/core/config/env.dart';

/// API endpoint constants ported from apps/native/lib/config/api.ts.
class ApiConfig {
  const ApiConfig._();

  /// Base URL with Android emulator localhost rewriting.
  static String get baseUrl {
    var url = Env.apiBaseUrl.replaceAll(RegExp(r'/$'), '');

    // Android emulator maps localhost → 10.0.2.2
    if (Platform.isAndroid && url.contains('localhost')) {
      url = url.replaceAll('localhost', '10.0.2.2');
    }

    return url;
  }
}

/// Auth endpoint paths (called via the mobile auth API on the web backend).
abstract final class AuthEndpoints {
  static const sendOtp = '/api/v1/auth/mobile/send-otp';
  static const verifyOtp = '/api/v1/auth/mobile/verify-otp';
  static const passwordLogin = '/api/v1/auth/mobile/password-login';
}
