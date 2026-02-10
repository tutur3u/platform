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

/// Profile endpoint paths.
abstract final class ProfileEndpoints {
  static const profile = '/api/v1/users/me/profile';
  static const email = '/api/v1/users/me/email';
  static const fullName = '/api/v1/users/me/full-name';
  static const avatarUploadUrl = '/api/v1/users/me/avatar/upload-url';
  static const avatar = '/api/v1/users/me/avatar';
}
