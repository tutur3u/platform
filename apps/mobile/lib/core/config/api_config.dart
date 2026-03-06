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

/// Finance endpoint paths.
abstract final class FinanceEndpoints {
  static String wallets(String wsId) => '/api/workspaces/$wsId/wallets';

  static String transactions(String wsId) =>
      '/api/workspaces/$wsId/transactions';

  static String wallet(String wsId, String walletId) =>
      '/api/workspaces/$wsId/wallets/$walletId';

  static String categories(String wsId) =>
      '/api/workspaces/$wsId/transactions/categories';

  static String category(String wsId, String categoryId) =>
      '/api/workspaces/$wsId/transactions/categories/$categoryId';

  static String tags(String wsId) => '/api/workspaces/$wsId/tags';

  static String tag(String wsId, String tagId) =>
      '/api/workspaces/$wsId/tags/$tagId';

  static String transaction(String wsId, String transactionId) =>
      '/api/workspaces/$wsId/transactions/$transactionId';

  static String transfers(String wsId) => '/api/workspaces/$wsId/transfers';

  /// Cursor-based infinite-scroll endpoint (mirrors web's transactions/infinite).
  static String infiniteTransactions(String wsId) =>
      '/api/workspaces/$wsId/transactions/infinite';

  static String transactionStats(String wsId) =>
      '/api/workspaces/$wsId/transactions/stats';

  static String workspaceConfig(String wsId, String configId) =>
      '/api/v1/workspaces/$wsId/settings/$configId';

  static const exchangeRates = '/api/v1/exchange-rates';
}
