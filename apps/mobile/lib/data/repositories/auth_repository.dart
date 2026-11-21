import 'dart:async';
import 'dart:developer' as developer;

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/core/config/env.dart';
import 'package:mobile/core/platform/device_platform.dart';
import 'package:mobile/core/utils/device_info.dart';
import 'package:mobile/data/models/auth_action_result.dart';
import 'package:mobile/data/models/auth_session.dart';
import 'package:mobile/data/models/stored_account_switch_result.dart';
import 'package:mobile/data/models/stored_auth_account.dart';
import 'package:mobile/data/repositories/multi_account_storage_service.dart';
import 'package:mobile/data/repositories/provider_sign_in.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/data/sources/apple_identity_client.dart';
import 'package:mobile/data/sources/google_identity_client.dart';
import 'package:mobile/data/sources/oauth_url_launcher.dart';
import 'package:mobile/data/sources/secure_storage.dart';
import 'package:mobile/data/sources/supabase_client.dart';
import 'package:mobile/features/auth/required_mfa_policy.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

typedef PackageInfoLoader = Future<PackageInfo> Function();

/// Repository for all authentication operations.
///
/// Ported from apps/native/lib/stores/auth-store.ts.
class AuthRepository {
  AuthRepository({
    ApiClient? apiClient,
    SupabaseClient? supabaseClient,
    FlutterSecureStorage? secureStorage,
    MultiAccountStorageService? multiAccountStorageService,
    GoogleIdentityClient? googleIdentityClient,
    AppleIdentityClient? appleIdentityClient,
    OAuthUrlLauncher? oauthUrlLauncher,
    PackageInfoLoader? packageInfoLoader,
    DevicePlatform? devicePlatform,
    String? googleWebClientId,
    String? googleIosClientId,
    Future<bool> Function()? iosAppOnMacDetector,
  }) {
    final resolvedApiClient = apiClient ?? ApiClient();
    final resolvedSupabaseClient = supabaseClient ?? supabase;
    final resolvedGoogleIdentityClient =
        googleIdentityClient ?? GoogleIdentityClientImpl();
    final resolvedDevicePlatform =
        devicePlatform ?? const DefaultDevicePlatform();

    _apiClient = resolvedApiClient;
    _client = resolvedSupabaseClient;
    _googleIdentityClient = resolvedGoogleIdentityClient;
    _devicePlatform = resolvedDevicePlatform;
    _providerSignIn = ProviderSignIn(
      client: resolvedSupabaseClient,
      googleIdentityClient: resolvedGoogleIdentityClient,
      appleIdentityClient:
          appleIdentityClient ?? const AppleIdentityClientImpl(),
      oauthUrlLauncher:
          oauthUrlLauncher ??
          SupabaseOAuthUrlLauncher(devicePlatform: resolvedDevicePlatform),
      packageInfoLoader: packageInfoLoader ?? PackageInfo.fromPlatform,
      devicePlatform: resolvedDevicePlatform,
      isIOSAppOnMac: iosAppOnMacDetector ?? isIOSAppOnMac,
      googleWebClientId: googleWebClientId ?? Env.googleWebClientId,
      googleIosClientId: googleIosClientId ?? Env.googleIosClientId,
    );
    _multiAccountStorageService =
        multiAccountStorageService ??
        MultiAccountStorageService(
          supabaseClient: _client,
          secureStorage: secureStorage ?? authSecureStorage,
          apiClient: _apiClient,
          googleIdentityClient: _googleIdentityClient,
        );
  }

  late final ApiClient _apiClient;
  late final SupabaseClient _client;
  late final GoogleIdentityClient _googleIdentityClient;
  late final ProviderSignIn _providerSignIn;
  late final DevicePlatform _devicePlatform;
  late final MultiAccountStorageService _multiAccountStorageService;

  String? get _mobileOtpPlatform {
    if (_devicePlatform.isIOS) {
      return 'ios';
    }
    if (_devicePlatform.isAndroid) {
      return 'android';
    }
    return null;
  }

  Future<List<StoredAuthAccount>> getStoredAccounts() async {
    return await _multiAccountStorageService.getStoredAccounts();
  }

  Future<String?> getActiveStoredAccountId() async {
    return await _multiAccountStorageService.getActiveStoredAccountId();
  }

  Future<void> syncCurrentSessionToMultiAccountStore({
    bool switchImmediately = true,
  }) async {
    await _multiAccountStorageService.syncCurrentSessionToMultiAccountStore(
      switchImmediately: switchImmediately,
    );
  }

  Future<({bool success, String? error})> completeAddAccountFlow() async {
    return await _multiAccountStorageService.completeAddAccountFlow();
  }

  Future<StoredAccountSwitchResult> switchToStoredAccount(
    String accountId, {
    Future<void> Function()? beforeActivate,
  }) => _multiAccountStorageService.switchToStoredAccount(
    accountId,
    beforeActivate: beforeActivate,
  );

  Future<StoredAccountRemovalResult> removeStoredAccount(
    String accountId,
  ) async {
    return await _multiAccountStorageService.removeStoredAccount(accountId);
  }

  Future<void> updateActiveAccountWorkspaceContext(String workspaceId) async {
    await _multiAccountStorageService.updateActiveAccountWorkspaceContext(
      workspaceId,
    );
  }

  Future<StoredAccountRemovalResult> signOutCurrentAccount() async {
    return await _multiAccountStorageService.signOutCurrentAccount();
  }

  Future<({bool success, String? error})> signOutAllAccounts() async {
    return await _multiAccountStorageService.signOutAllAccounts();
  }

  // ── OTP ─────────────────────────────────────────

  Future<({bool success, String? error, int? retryAfter})> sendOtp(
    String email, {
    String? captchaToken,
  }) async {
    try {
      final deviceId = await getDeviceId();
      final response = await _apiClient.postJson(AuthEndpoints.otpSend, {
        'client': 'mobile',
        'email': email,
        'locale': getLocale(),
        'platform': _mobileOtpPlatform,
        if (deviceId != null) 'deviceId': deviceId,
        if (captchaToken != null) 'captchaToken': captchaToken,
      }, requiresAuth: false);

      if (response['error'] != null) {
        return (
          success: false,
          error: response['error'] as String,
          retryAfter: response['retryAfter'] as int?,
        );
      }

      return (success: true, error: null, retryAfter: null);
    } on ApiException catch (e) {
      return (success: false, error: e.message, retryAfter: e.retryAfter);
    } on Exception catch (e) {
      return (success: false, error: e.toString(), retryAfter: null);
    }
  }

  Future<({bool success, String? error})> verifyOtp(
    String email,
    String otp,
  ) async {
    try {
      final deviceId = await getDeviceId();
      final response = await _apiClient.postJson(AuthEndpoints.otpVerify, {
        'client': 'mobile',
        'email': email,
        'locale': getLocale(),
        'otp': otp,
        'platform': _mobileOtpPlatform,
        if (deviceId != null) 'deviceId': deviceId,
      }, requiresAuth: false);

      if (response['error'] != null) {
        return (success: false, error: response['error'] as String);
      }

      final sessionJson = response['session'] as Map<String, dynamic>?;
      if (sessionJson == null) {
        return (success: false, error: 'No session returned');
      }

      final payload = AuthSessionPayload.fromJson(sessionJson);
      await _client.auth.setSession(payload.refreshToken);

      return (success: true, error: null);
    } on ApiException catch (e) {
      return (success: false, error: e.message);
    } on AuthException catch (e) {
      return (success: false, error: e.message);
    } on Exception catch (e) {
      return (success: false, error: e.toString());
    }
  }

  // ── Password ────────────────────────────────────

  Future<({bool success, String? error, int? retryAfter})> passwordLogin(
    String email,
    String password, {
    String? captchaToken,
  }) async {
    try {
      final deviceId = await getDeviceId();
      final response = await _apiClient.postJson(AuthEndpoints.passwordLogin, {
        'client': 'mobile',
        'email': email,
        'password': password,
        'locale': getLocale(),
        if (deviceId != null) 'deviceId': deviceId,
        if (captchaToken != null) 'captchaToken': captchaToken,
      }, requiresAuth: false);

      if (response['error'] != null) {
        return (
          success: false,
          error: response['error'] as String,
          retryAfter: response['retryAfter'] as int?,
        );
      }

      final sessionJson = response['session'] as Map<String, dynamic>?;
      if (sessionJson == null) {
        return (success: false, error: 'No session returned', retryAfter: null);
      }

      final payload = AuthSessionPayload.fromJson(sessionJson);
      try {
        final authResponse = await _client.auth.setSession(
          payload.refreshToken,
        );
        developer.log(
          'Password login session hydrated',
          name: 'AuthRepository',
          error: {
            'supabaseUrl': Env.supabaseUrl,
            'apiBaseUrl': Env.apiBaseUrl,
            'hasSession': authResponse.session != null,
            'userId': authResponse.user?.id,
          },
        );
      } on AuthException catch (e, stackTrace) {
        developer.log(
          'Failed to hydrate mobile auth session after password login',
          name: 'AuthRepository',
          error: {
            'supabaseUrl': Env.supabaseUrl,
            'apiBaseUrl': Env.apiBaseUrl,
            'message': e.message,
          },
          stackTrace: stackTrace,
          level: 1000,
        );
        rethrow;
      }

      return (success: true, error: null, retryAfter: null);
    } on ApiException catch (e) {
      return (success: false, error: e.message, retryAfter: e.retryAfter);
    } on AuthException catch (e) {
      return (success: false, error: e.message, retryAfter: null);
    } on Exception catch (e) {
      return (success: false, error: e.toString(), retryAfter: null);
    }
  }

  // ── MFA ────────────────────────────────────────

  /// Returns `true` if user has verified TOTP factors but session is at aal1.
  bool checkMfaRequired() {
    if (requiresAccountMfa(_client.auth.currentSession)) return true;
    try {
      final aal = _client.auth.mfa.getAuthenticatorAssuranceLevel();
      return aal.currentLevel == AuthenticatorAssuranceLevels.aal1 &&
          aal.nextLevel == AuthenticatorAssuranceLevels.aal2;
    } on Exception {
      return false;
    }
  }

  /// Returns verified TOTP factors for the current user.
  Future<List<Factor>> getVerifiedTotpFactors() async {
    final response = await _client.auth.mfa.listFactors();
    return response.totp
        .where((f) => f.status == FactorStatus.verified)
        .toList();
  }

  /// Attempts to verify a TOTP code against enrolled factors.
  Future<({bool success, String? error})> verifyMfaCode(String code) async {
    try {
      final factors = await getVerifiedTotpFactors();
      if (factors.isEmpty) {
        return (success: false, error: 'No verified TOTP factors found');
      }

      for (final factor in factors) {
        try {
          final challenge = await _client.auth.mfa.challenge(
            factorId: factor.id,
          );
          await _client.auth.mfa.verify(
            factorId: factor.id,
            challengeId: challenge.id,
            code: code,
          );
          return (success: true, error: null);
        } on AuthException {
          // Try next factor if this one fails
          continue;
        }
      }

      return (success: false, error: 'Invalid verification code');
    } on AuthException catch (e) {
      return (success: false, error: e.message);
    } on Exception catch (e) {
      return (success: false, error: e.toString());
    }
  }

  // ── Sign up ─────────────────────────────────────

  Future<({bool success, String? error})> signUp(
    String email,
    String password,
  ) async {
    try {
      final response = await _client.auth.signUp(
        email: email,
        password: password,
      );

      if (response.user == null) {
        return (success: false, error: 'Sign up failed');
      }

      return (success: true, error: null);
    } on AuthException catch (e) {
      return (success: false, error: e.message);
    }
  }

  // ── Password reset ──────────────────────────────

  Future<({bool success, String? error})> resetPassword(String email) async {
    try {
      await _client.auth.resetPasswordForEmail(email);
      return (success: true, error: null);
    } on AuthException catch (e) {
      return (success: false, error: e.message);
    }
  }

  // ── Providers ──────────────────────────────────

  Future<AuthActionResult> signInWithGoogle() =>
      _providerSignIn.signInWithGoogle();

  Future<AuthActionResult> signInWithApple() =>
      _providerSignIn.signInWithApple();

  Future<AuthActionResult> signInWithGithub() =>
      _providerSignIn.signInWithGithub();

  // ── Session management ──────────────────────────

  /// Returns the cached current user synchronously.
  ///
  /// Safe to call after `Supabase.initialize()` has completed (which happens
  /// in `main()` before `runApp()`).
  User? getCurrentUserSync() => _client.auth.currentUser;

  Future<User?> getCurrentUser() async {
    return _client.auth.currentUser;
  }

  Future<Session?> getCurrentSession() async {
    return _client.auth.currentSession;
  }

  Future<({bool success, String? error})> signInWithSession(
    AuthSessionPayload payload,
  ) async {
    try {
      await _client.auth.setSession(payload.refreshToken);
      return (success: true, error: null);
    } on AuthException catch (error) {
      return (success: false, error: error.message);
    } on Exception catch (error) {
      return (success: false, error: error.toString());
    }
  }

  Stream<AuthState> onAuthStateChange() {
    return _client.auth.onAuthStateChange;
  }

  Future<void> signOut() async {
    try {
      await _googleIdentityClient.signOut();
    } on Exception {
      // Ignore Google sign-out failures and still clear the Supabase session.
    }

    try {
      await _client.auth.signOut();
    } finally {
      await _multiAccountStorageService.clearMultiAccountStore();
    }
  }

  Future<void> refreshSession() async {
    await _client.auth.refreshSession();
  }

  void dispose() {
    _apiClient.dispose();
  }
}
