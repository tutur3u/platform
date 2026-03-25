import 'dart:async';

import 'package:google_sign_in/google_sign_in.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/core/config/env.dart';
import 'package:mobile/core/platform/device_platform.dart';
import 'package:mobile/core/utils/device_info.dart';
import 'package:mobile/data/models/auth_action_result.dart';
import 'package:mobile/data/models/auth_session.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/data/sources/google_identity_client.dart';
import 'package:mobile/data/sources/oauth_url_launcher.dart';
import 'package:mobile/data/sources/supabase_client.dart';
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
    GoogleIdentityClient? googleIdentityClient,
    OAuthUrlLauncher? oauthUrlLauncher,
    PackageInfoLoader? packageInfoLoader,
    DevicePlatform? devicePlatform,
    String? googleWebClientId,
    String? googleIosClientId,
  }) : _apiClient = apiClient ?? ApiClient(),
       _client = supabaseClient ?? supabase,
       _googleIdentityClient =
           googleIdentityClient ?? GoogleIdentityClientImpl(),
       _devicePlatform = devicePlatform ?? const DefaultDevicePlatform(),
       _oauthUrlLauncher =
           oauthUrlLauncher ??
           SupabaseOAuthUrlLauncher(
             devicePlatform: devicePlatform ?? const DefaultDevicePlatform(),
           ),
       _packageInfoLoader = packageInfoLoader ?? PackageInfo.fromPlatform,
       _googleWebClientId = googleWebClientId ?? Env.googleWebClientId,
       _googleIosClientId = googleIosClientId ?? Env.googleIosClientId;

  final ApiClient _apiClient;
  final SupabaseClient _client;
  final GoogleIdentityClient _googleIdentityClient;
  final OAuthUrlLauncher _oauthUrlLauncher;
  final PackageInfoLoader _packageInfoLoader;
  final DevicePlatform _devicePlatform;
  final String _googleWebClientId;
  final String _googleIosClientId;

  // ── Password ────────────────────────────────────

  Future<({bool success, String? error, int? retryAfter})> passwordLogin(
    String email,
    String password, {
    String? captchaToken,
  }) async {
    try {
      final deviceId = await getDeviceId();
      final response = await _apiClient.postJson(
        AuthEndpoints.passwordLogin,
        {
          'email': email,
          'password': password,
          'locale': getLocale(),
          if (deviceId != null) 'deviceId': deviceId,
          if (captchaToken != null) 'captchaToken': captchaToken,
        },
        requiresAuth: false,
      );

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
      await _client.auth.setSession(payload.refreshToken);

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

  // ── Google ─────────────────────────────────────

  Future<AuthActionResult> signInWithGoogle() async {
    if (_shouldTryNativeGoogleSignIn()) {
      final nativeResult = await _tryNativeGoogleSignIn();
      if (nativeResult != null) {
        return nativeResult;
      }
    }

    return _launchBrowserGoogleSignIn();
  }

  Future<AuthActionResult> signInWithApple() {
    return _launchBrowserAppleSignIn();
  }

  bool _shouldTryNativeGoogleSignIn() {
    if (!(_devicePlatform.isAndroid || _devicePlatform.isIOS)) {
      return false;
    }

    if (_googleWebClientId.isEmpty) {
      return false;
    }

    return true;
  }

  Future<AuthActionResult?> _tryNativeGoogleSignIn() async {
    try {
      await _googleIdentityClient.initialize(
        clientId: _devicePlatform.isIOS && _googleIosClientId.isNotEmpty
            ? _googleIosClientId
            : null,
        serverClientId: _googleWebClientId,
      );

      if (!_googleIdentityClient.supportsAuthenticate()) {
        return null;
      }

      final tokens = await _googleIdentityClient.authenticate();
      return await _completeNativeGoogleSignIn(tokens);
    } on GoogleSignInException catch (e) {
      if (e.code == GoogleSignInExceptionCode.canceled) {
        return const AuthActionResult.cancelled();
      }

      if (_shouldFallbackToBrowserFromNativeError(e.code)) {
        return null;
      }

      return const AuthActionResult.failure(AuthErrorCode.googleSignInFailed);
    } on Exception {
      return const AuthActionResult.failure(AuthErrorCode.googleSignInFailed);
    }
  }

  Future<AuthActionResult> _completeNativeGoogleSignIn(
    GoogleIdentityTokens tokens,
  ) async {
    try {
      await _client.auth.signInWithIdToken(
        provider: OAuthProvider.google,
        idToken: tokens.idToken,
        accessToken: tokens.accessToken,
      );

      return const AuthActionResult.success();
    } on AuthException {
      return const AuthActionResult.failure(AuthErrorCode.googleSignInFailed);
    } on Exception {
      return const AuthActionResult.failure(AuthErrorCode.googleSignInFailed);
    }
  }

  bool _shouldFallbackToBrowserFromNativeError(
    GoogleSignInExceptionCode code,
  ) {
    return switch (code) {
      GoogleSignInExceptionCode.clientConfigurationError ||
      GoogleSignInExceptionCode.providerConfigurationError ||
      GoogleSignInExceptionCode.uiUnavailable => true,
      GoogleSignInExceptionCode.unknownError ||
      GoogleSignInExceptionCode.interrupted ||
      GoogleSignInExceptionCode.userMismatch ||
      GoogleSignInExceptionCode.canceled => false,
    };
  }

  Future<AuthActionResult> _launchBrowserGoogleSignIn() async {
    try {
      final redirectTo = await _buildAuthRedirectUrl();
      final launched = await _oauthUrlLauncher.launchProviderSignIn(
        authClient: _client.auth,
        provider: OAuthProvider.google,
        redirectTo: redirectTo,
        queryParams: const {
          'access_type': 'offline',
          'prompt': 'consent',
        },
      );

      if (!launched) {
        return const AuthActionResult.failure(
          AuthErrorCode.googleBrowserLaunchFailed,
        );
      }

      return const AuthActionResult.externalFlowStarted();
    } on Exception {
      return const AuthActionResult.failure(
        AuthErrorCode.googleBrowserLaunchFailed,
      );
    }
  }

  Future<AuthActionResult> _launchBrowserAppleSignIn() async {
    try {
      final redirectTo = await _buildAuthRedirectUrl();
      final launched = await _oauthUrlLauncher.launchProviderSignIn(
        authClient: _client.auth,
        provider: OAuthProvider.apple,
        redirectTo: redirectTo,
        queryParams: const {
          'prompt': 'consent',
        },
      );

      if (!launched) {
        return const AuthActionResult.failure(
          AuthErrorCode.appleBrowserLaunchFailed,
        );
      }

      return const AuthActionResult.externalFlowStarted();
    } on Exception {
      return const AuthActionResult.failure(
        AuthErrorCode.appleBrowserLaunchFailed,
      );
    }
  }

  Future<String> _buildAuthRedirectUrl() async {
    final packageInfo = await _packageInfoLoader();
    final packageName = packageInfo.packageName.trim();
    final scheme = packageName.isEmpty
        ? 'com.tuturuuu.app.mobile'
        : packageName;
    return '$scheme://login-callback';
  }

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

  Stream<AuthState> onAuthStateChange() {
    return _client.auth.onAuthStateChange;
  }

  Future<void> signOut() async {
    try {
      await _googleIdentityClient.signOut();
    } on Exception {
      // Ignore Google sign-out failures and still clear the Supabase session.
    }

    await _client.auth.signOut();
  }

  Future<void> refreshSession() async {
    await _client.auth.refreshSession();
  }

  void dispose() {
    _apiClient.dispose();
  }
}
