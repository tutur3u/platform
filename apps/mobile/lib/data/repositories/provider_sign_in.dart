import 'dart:developer' as developer;

import 'package:flutter/services.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:mobile/core/config/auth_callback.dart';
import 'package:mobile/core/platform/device_platform.dart';
import 'package:mobile/data/models/auth_action_result.dart';
import 'package:mobile/data/sources/apple_identity_client.dart';
import 'package:mobile/data/sources/google_identity_client.dart';
import 'package:mobile/data/sources/oauth_url_launcher.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

/// Google, Apple and GitHub sign-in for `AuthRepository`.
///
/// Failures carry only an [AuthErrorCode]; the UI maps it to a localized
/// message. Provider and platform details go to the log, never to the screen.
class ProviderSignIn {
  ProviderSignIn({
    required SupabaseClient client,
    required GoogleIdentityClient googleIdentityClient,
    required AppleIdentityClient appleIdentityClient,
    required OAuthUrlLauncher oauthUrlLauncher,
    required Future<PackageInfo> Function() packageInfoLoader,
    required DevicePlatform devicePlatform,
    required Future<bool> Function() isIOSAppOnMac,
    required String googleWebClientId,
    required String googleIosClientId,
  }) : _client = client,
       _googleIdentityClient = googleIdentityClient,
       _appleIdentityClient = appleIdentityClient,
       _oauthUrlLauncher = oauthUrlLauncher,
       _packageInfoLoader = packageInfoLoader,
       _devicePlatform = devicePlatform,
       _isIOSAppOnMac = isIOSAppOnMac,
       _googleWebClientId = googleWebClientId,
       _googleIosClientId = googleIosClientId;

  final SupabaseClient _client;
  final GoogleIdentityClient _googleIdentityClient;
  final AppleIdentityClient _appleIdentityClient;
  final OAuthUrlLauncher _oauthUrlLauncher;
  final Future<PackageInfo> Function() _packageInfoLoader;
  final DevicePlatform _devicePlatform;
  final Future<bool> Function() _isIOSAppOnMac;
  final String _googleWebClientId;
  final String _googleIosClientId;

  Future<AuthActionResult> signInWithGoogle() async {
    if (await _shouldTryNativeGoogleSignIn()) {
      final nativeResult = await _tryNativeGoogleSignIn();
      if (nativeResult != null) {
        return nativeResult;
      }
    }

    return await _launchBrowserOAuthSignIn(
      provider: OAuthProvider.google,
      queryParams: const {'access_type': 'offline', 'prompt': 'consent'},
      errorCode: AuthErrorCode.googleBrowserLaunchFailed,
    );
  }

  Future<AuthActionResult> signInWithApple() async {
    if (_devicePlatform.isIOS) {
      final nativeResult = await _tryNativeAppleSignIn();
      if (nativeResult != null) {
        return nativeResult;
      }
    }

    _logFailure('Sign in with Apple is unavailable on this device');
    return const AuthActionResult.failure(AuthErrorCode.appleSignInFailed);
  }

  Future<AuthActionResult> signInWithGithub() {
    return _launchBrowserOAuthSignIn(
      provider: OAuthProvider.github,
      queryParams: const {},
      errorCode: AuthErrorCode.githubBrowserLaunchFailed,
    );
  }

  Future<bool> _shouldTryNativeGoogleSignIn() async {
    if (!(_devicePlatform.isAndroid || _devicePlatform.isIOS)) {
      return false;
    }

    if (_googleWebClientId.isEmpty) {
      return false;
    }

    // The iOS build on an Apple silicon Mac runs Google's AppAuth token
    // exchange against a Mac host it does not support; browser OAuth works.
    if (_devicePlatform.isIOS && await _isIOSAppOnMac()) {
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
    } on GoogleSignInException catch (e, stackTrace) {
      if (_shouldFallbackToBrowserFromNativeError(e)) {
        _logFailure(
          'Native Google sign-in unavailable; using browser OAuth',
          error: e,
          stackTrace: stackTrace,
        );
        return null;
      }

      if (e.code == GoogleSignInExceptionCode.canceled) {
        return const AuthActionResult.cancelled();
      }

      _logFailure(
        'Native Google sign-in failed',
        error: e,
        stackTrace: stackTrace,
      );
      return const AuthActionResult.failure(AuthErrorCode.googleSignInFailed);
    } on PlatformException catch (e, stackTrace) {
      // AppAuth token exchange errors (for example invalid_audience) mean the
      // native client cannot finish sign-in, so browser OAuth through
      // Supabase's own Google client takes over.
      final detail = '${e.code} ${e.message}';
      if (e.code.startsWith('org.openid.appauth') ||
          _isOAuthClientConfigError(detail)) {
        _logFailure(
          'Native Google sign-in platform error; using browser OAuth',
          error: e,
          stackTrace: stackTrace,
        );
        return null;
      }

      _logFailure(
        'Native Google sign-in failed',
        error: e,
        stackTrace: stackTrace,
      );
      return const AuthActionResult.failure(AuthErrorCode.googleSignInFailed);
    } on Exception catch (e, stackTrace) {
      _logFailure(
        'Native Google sign-in failed',
        error: e,
        stackTrace: stackTrace,
      );
      return const AuthActionResult.failure(AuthErrorCode.googleSignInFailed);
    }
  }

  Future<AuthActionResult?> _tryNativeAppleSignIn() async {
    try {
      if (!await _appleIdentityClient.isAvailable()) {
        return null;
      }

      final tokens = await _appleIdentityClient.authenticate();
      return await _completeNativeAppleSignIn(tokens);
    } on SignInWithAppleAuthorizationException catch (e, stackTrace) {
      if (e.code == AuthorizationErrorCode.canceled) {
        return const AuthActionResult.cancelled();
      }

      _logFailure(
        'Sign in with Apple failed',
        error: e,
        stackTrace: stackTrace,
      );
      return const AuthActionResult.failure(AuthErrorCode.appleSignInFailed);
    } on SignInWithAppleNotSupportedException {
      return null;
    } on Exception catch (e, stackTrace) {
      _logFailure(
        'Sign in with Apple failed',
        error: e,
        stackTrace: stackTrace,
      );
      return const AuthActionResult.failure(AuthErrorCode.appleSignInFailed);
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
    } on Exception catch (e, stackTrace) {
      _logFailure(
        'Supabase rejected the Google ID token',
        error: e,
        stackTrace: stackTrace,
      );
      return const AuthActionResult.failure(AuthErrorCode.googleSignInFailed);
    }
  }

  Future<AuthActionResult> _completeNativeAppleSignIn(
    AppleIdentityTokens tokens,
  ) async {
    try {
      await _client.auth.signInWithIdToken(
        provider: OAuthProvider.apple,
        idToken: tokens.idToken,
        nonce: tokens.rawNonce,
      );

      final metadata = <String, dynamic>{};
      final fullName = _buildAppleFullName(
        givenName: tokens.givenName,
        familyName: tokens.familyName,
      );
      if (fullName != null) {
        metadata['full_name'] = fullName;
      }

      if (metadata.isNotEmpty) {
        try {
          await _client.auth.updateUser(UserAttributes(data: metadata));
        } on AuthException {
          // Apple only returns name fields on the first authorization.
          // Do not fail sign-in if persisting that optional metadata fails.
        }
      }

      return const AuthActionResult.success();
    } on Exception catch (e, stackTrace) {
      _logFailure(
        'Supabase rejected the Apple ID token',
        error: e,
        stackTrace: stackTrace,
      );
      return const AuthActionResult.failure(AuthErrorCode.appleSignInFailed);
    }
  }

  String? _buildAppleFullName({
    required String? givenName,
    required String? familyName,
  }) {
    final parts = <String>[
      if (givenName case final String value when value.trim().isNotEmpty)
        value.trim(),
      if (familyName case final String value when value.trim().isNotEmpty)
        value.trim(),
    ];

    if (parts.isEmpty) {
      return null;
    }

    return parts.join(' ');
  }

  bool _shouldFallbackToBrowserFromNativeError(GoogleSignInException error) {
    return switch (error.code) {
      GoogleSignInExceptionCode.clientConfigurationError ||
      GoogleSignInExceptionCode.providerConfigurationError ||
      GoogleSignInExceptionCode.uiUnavailable => true,
      // google_sign_in on Android can surface Credential Manager
      // configuration failures as "canceled" after the user picks an account.
      // Fall back to browser OAuth there instead of silently doing nothing.
      GoogleSignInExceptionCode.canceled => _devicePlatform.isAndroid,
      // OAuth client misconfiguration can arrive as an unknown error carrying
      // the token endpoint's error code.
      GoogleSignInExceptionCode.unknownError => _isOAuthClientConfigError(
        error.description,
      ),
      GoogleSignInExceptionCode.interrupted ||
      GoogleSignInExceptionCode.userMismatch => false,
    };
  }

  bool _isOAuthClientConfigError(String? description) {
    if (description == null) return false;
    return description.contains('invalid_audience') ||
        description.contains('invalid_client') ||
        description.contains('unauthorized_client');
  }

  Future<AuthActionResult> _launchBrowserOAuthSignIn({
    required OAuthProvider provider,
    required Map<String, String> queryParams,
    required AuthErrorCode errorCode,
  }) async {
    try {
      final packageInfo = await _packageInfoLoader();
      final launched = await _oauthUrlLauncher.launchProviderSignIn(
        authClient: _client.auth,
        provider: provider,
        redirectTo: authCallbackUrl(packageInfo.packageName),
        queryParams: queryParams,
      );

      if (!launched) {
        _logFailure('Browser OAuth did not launch for ${provider.name}');
        return AuthActionResult.failure(errorCode);
      }

      return const AuthActionResult.externalFlowStarted();
    } on Exception catch (e, stackTrace) {
      _logFailure(
        'Browser OAuth launch failed for ${provider.name}',
        error: e,
        stackTrace: stackTrace,
      );
      return AuthActionResult.failure(errorCode);
    }
  }

  void _logFailure(String message, {Object? error, StackTrace? stackTrace}) {
    developer.log(
      message,
      name: 'ProviderSignIn',
      error: error,
      stackTrace: stackTrace,
      level: 900,
    );
  }
}
