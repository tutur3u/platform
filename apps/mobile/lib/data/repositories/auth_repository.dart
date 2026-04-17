import 'dart:async';
import 'dart:convert';
import 'dart:developer' as developer;

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:google_sign_in/google_sign_in.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/core/config/env.dart';
import 'package:mobile/core/constants/storage_keys.dart';
import 'package:mobile/core/platform/device_platform.dart';
import 'package:mobile/core/utils/device_info.dart';
import 'package:mobile/data/models/auth_action_result.dart';
import 'package:mobile/data/models/auth_session.dart';
import 'package:mobile/data/models/multi_account_store.dart';
import 'package:mobile/data/models/stored_auth_account.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/data/sources/apple_identity_client.dart';
import 'package:mobile/data/sources/google_identity_client.dart';
import 'package:mobile/data/sources/oauth_url_launcher.dart';
import 'package:mobile/data/sources/supabase_client.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:sign_in_with_apple/sign_in_with_apple.dart';
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
    GoogleIdentityClient? googleIdentityClient,
    AppleIdentityClient? appleIdentityClient,
    OAuthUrlLauncher? oauthUrlLauncher,
    PackageInfoLoader? packageInfoLoader,
    DevicePlatform? devicePlatform,
    String? googleWebClientId,
    String? googleIosClientId,
  }) : _apiClient = apiClient ?? ApiClient(),
       _client = supabaseClient ?? supabase,
       _googleIdentityClient =
           googleIdentityClient ?? GoogleIdentityClientImpl(),
       _appleIdentityClient =
           appleIdentityClient ?? const AppleIdentityClientImpl(),
       _devicePlatform = devicePlatform ?? const DefaultDevicePlatform(),
       _oauthUrlLauncher =
           oauthUrlLauncher ??
           SupabaseOAuthUrlLauncher(
             devicePlatform: devicePlatform ?? const DefaultDevicePlatform(),
           ),
       _packageInfoLoader = packageInfoLoader ?? PackageInfo.fromPlatform,
       _googleWebClientId = googleWebClientId ?? Env.googleWebClientId,
       _googleIosClientId = googleIosClientId ?? Env.googleIosClientId,
       _secureStorage = secureStorage ?? const FlutterSecureStorage();

  final ApiClient _apiClient;
  final SupabaseClient _client;
  final GoogleIdentityClient _googleIdentityClient;
  final AppleIdentityClient _appleIdentityClient;
  final OAuthUrlLauncher _oauthUrlLauncher;
  final PackageInfoLoader _packageInfoLoader;
  final DevicePlatform _devicePlatform;
  final String _googleWebClientId;
  final String _googleIosClientId;
  final FlutterSecureStorage _secureStorage;

  static const int _multiAccountStoreVersion = 1;
  static const int _maxStoredAccounts = 5;

  String? get _mobileOtpPlatform {
    if (_devicePlatform.isIOS) {
      return 'ios';
    }
    if (_devicePlatform.isAndroid) {
      return 'android';
    }
    return null;
  }

  Future<MultiAccountStore> _loadMultiAccountStore() async {
    try {
      final raw = await _secureStorage.read(key: StorageKeys.multiAccountStore);
      if (raw == null || raw.isEmpty) {
        return MultiAccountStore.empty();
      }
      final decoded = jsonDecode(raw);
      if (decoded is! Map<String, dynamic>) {
        return MultiAccountStore.empty();
      }
      final store = MultiAccountStore.fromJson(decoded);
      if (store.version != _multiAccountStoreVersion) {
        return MultiAccountStore.empty();
      }
      return store;
    } on Object {
      // Catch both Exception and Error (e.g. TypeError from malformed JSON
      // entries written by an older app version).
      return MultiAccountStore.empty();
    }
  }

  Future<void> _saveMultiAccountStore(MultiAccountStore store) async {
    await _secureStorage.write(
      key: StorageKeys.multiAccountStore,
      value: jsonEncode(store.toJson()),
    );
  }

  Future<void> _clearMultiAccountStore() async {
    await _secureStorage.delete(key: StorageKeys.multiAccountStore);
  }

  Future<String?> _readCurrentPersistedSessionJson() async {
    return _secureStorage.read(key: supabasePersistSessionKey);
  }

  String? _readDisplayName(User user) {
    final metadata = user.userMetadata;
    final displayName = metadata?['display_name'] as String?;
    if (displayName != null && displayName.trim().isNotEmpty) {
      return displayName.trim();
    }
    final fullName = metadata?['full_name'] as String?;
    if (fullName != null && fullName.trim().isNotEmpty) {
      return fullName.trim();
    }
    return null;
  }

  String? _readAvatarUrl(User user) {
    final avatarUrl = user.userMetadata?['avatar_url'] as String?;
    if (avatarUrl == null || avatarUrl.trim().isEmpty) {
      return null;
    }
    return avatarUrl.trim();
  }

  String? _nonEmptyTrimmed(String? value) {
    if (value == null || value.trim().isEmpty) {
      return null;
    }
    return value.trim();
  }

  StoredAuthAccount _accountFromCurrentSession({
    required User user,
    required Session session,
    String? sessionJson,
    int? addedAt,
    int? lastActiveAt,
    String? lastWorkspaceId,
    String? fallbackDisplayName,
    String? fallbackAvatarUrl,
  }) {
    final refreshToken = session.refreshToken;
    if (refreshToken == null || refreshToken.isEmpty) {
      throw const AuthException('Session does not contain a refresh token');
    }
    final now = DateTime.now().millisecondsSinceEpoch;
    return StoredAuthAccount(
      id: user.id,
      refreshToken: refreshToken,
      sessionJson: sessionJson,
      email: user.email,
      displayName:
          _readDisplayName(user) ?? _nonEmptyTrimmed(fallbackDisplayName),
      avatarUrl: _readAvatarUrl(user) ?? _nonEmptyTrimmed(fallbackAvatarUrl),
      lastWorkspaceId: lastWorkspaceId,
      addedAt: addedAt ?? now,
      lastActiveAt: lastActiveAt ?? now,
    );
  }

  List<StoredAuthAccount> _sortAccountsByRecent(List<StoredAuthAccount> input) {
    final accounts = [...input]
      ..sort((a, b) => b.lastActiveAt.compareTo(a.lastActiveAt));
    return accounts;
  }

  Future<List<StoredAuthAccount>> getStoredAccounts() async {
    final store = await _loadMultiAccountStore();
    return _sortAccountsByRecent(store.accounts);
  }

  Future<String?> getActiveStoredAccountId() async {
    final store = await _loadMultiAccountStore();
    return store.activeAccountId;
  }

  Future<void> syncCurrentSessionToMultiAccountStore({
    bool switchImmediately = true,
  }) async {
    final session = _client.auth.currentSession;
    final user = _client.auth.currentUser;
    if (session == null || user == null) {
      return;
    }

    final sessionJson = await _readCurrentPersistedSessionJson();
    final store = await _loadMultiAccountStore();
    final now = DateTime.now().millisecondsSinceEpoch;
    final existingIndex = store.accounts.indexWhere((a) => a.id == user.id);

    final List<StoredAuthAccount> updated;
    if (existingIndex >= 0) {
      final existing = store.accounts[existingIndex];
      final refreshed = _accountFromCurrentSession(
        user: user,
        session: session,
        sessionJson: sessionJson,
        addedAt: existing.addedAt,
        lastActiveAt: now,
        lastWorkspaceId: existing.lastWorkspaceId,
        fallbackDisplayName: existing.displayName,
        fallbackAvatarUrl: existing.avatarUrl,
      );
      updated = [...store.accounts]..[existingIndex] = refreshed;
    } else {
      final appended = _accountFromCurrentSession(
        user: user,
        session: session,
        sessionJson: sessionJson,
      );
      updated = [...store.accounts, appended];
    }

    final sorted = _sortAccountsByRecent(updated);
    final trimmed = sorted.take(_maxStoredAccounts).toList();
    final isCurrentKept = trimmed.any((account) => account.id == user.id);
    final nextActiveId = switchImmediately
        ? (isCurrentKept ? user.id : trimmed.firstOrNull?.id)
        : (store.activeAccountId ?? (isCurrentKept ? user.id : null));

    await _saveMultiAccountStore(
      store.copyWith(accounts: trimmed, activeAccountId: nextActiveId),
    );
  }

  Future<({bool success, String? error})> completeAddAccountFlow() async {
    final session = _client.auth.currentSession;
    final user = _client.auth.currentUser;
    if (session == null || user == null) {
      return (success: false, error: 'No active session found');
    }

    final sessionJson = await _readCurrentPersistedSessionJson();
    final store = await _loadMultiAccountStore();
    final now = DateTime.now().millisecondsSinceEpoch;
    final existingIndex = store.accounts.indexWhere((a) => a.id == user.id);

    final List<StoredAuthAccount> updated;
    if (existingIndex >= 0) {
      final existing = store.accounts[existingIndex];
      updated = [...store.accounts]
        ..[existingIndex] = _accountFromCurrentSession(
          user: user,
          session: session,
          sessionJson: sessionJson,
          addedAt: existing.addedAt,
          lastActiveAt: now,
          lastWorkspaceId: existing.lastWorkspaceId,
          fallbackDisplayName: existing.displayName,
          fallbackAvatarUrl: existing.avatarUrl,
        );
    } else {
      updated = [
        ...store.accounts,
        _accountFromCurrentSession(
          user: user,
          session: session,
          sessionJson: sessionJson,
        ),
      ];
    }

    final trimmed = _sortAccountsByRecent(
      updated,
    ).take(_maxStoredAccounts).toList();

    await _saveMultiAccountStore(
      store.copyWith(accounts: trimmed, activeAccountId: user.id),
    );

    return (success: true, error: null);
  }

  Future<({bool success, String? error})> switchToStoredAccount(
    String accountId,
  ) async {
    final store = await _loadMultiAccountStore();
    final target = store.accounts.where((a) => a.id == accountId).firstOrNull;
    if (target == null) {
      return (success: false, error: 'Account not found');
    }

    try {
      final authResponse = target.sessionJson != null
          ? await _client.auth.recoverSession(target.sessionJson!)
          : await _client.auth.setSession(target.refreshToken);
      final session = authResponse.session;
      final user = authResponse.user;
      if (session == null || user == null) {
        return (success: false, error: 'Failed to restore session');
      }

      final now = DateTime.now().millisecondsSinceEpoch;
      final restoredSessionJson = await _readCurrentPersistedSessionJson();
      final updatedAccounts = store.accounts.map((account) {
        if (account.id != accountId) {
          return account;
        }
        return _accountFromCurrentSession(
          user: user,
          session: session,
          sessionJson: restoredSessionJson ?? target.sessionJson,
          addedAt: account.addedAt,
          lastActiveAt: now,
          lastWorkspaceId: account.lastWorkspaceId,
          fallbackDisplayName: account.displayName,
          fallbackAvatarUrl: account.avatarUrl,
        );
      }).toList();

      await _saveMultiAccountStore(
        store.copyWith(
          accounts: _sortAccountsByRecent(updatedAccounts),
          activeAccountId: accountId,
        ),
      );

      return (success: true, error: null);
    } on AuthException catch (e) {
      return (success: false, error: e.message);
    } on Exception catch (e) {
      return (success: false, error: e.toString());
    }
  }

  Future<({bool success, bool switched, String? error})> removeStoredAccount(
    String accountId,
  ) async {
    final store = await _loadMultiAccountStore();
    final accountExists = store.accounts.any(
      (account) => account.id == accountId,
    );
    if (!accountExists) {
      return (success: false, switched: false, error: 'Account not found');
    }

    final remaining = store.accounts
        .where((account) => account.id != accountId)
        .toList();

    final wasActive = store.activeAccountId == accountId;
    if (!wasActive) {
      final nextActiveId = remaining.any((a) => a.id == store.activeAccountId)
          ? store.activeAccountId
          : remaining.firstOrNull?.id;
      await _saveMultiAccountStore(
        store.copyWith(
          accounts: _sortAccountsByRecent(remaining),
          activeAccountId: nextActiveId,
        ),
      );
      return (success: true, switched: false, error: null);
    }

    if (remaining.isEmpty) {
      await _client.auth.signOut();
      await _clearMultiAccountStore();
      return (success: true, switched: false, error: null);
    }

    final fallback = _sortAccountsByRecent(remaining).first;
    final switchResult = await switchToStoredAccount(fallback.id);
    if (!switchResult.success) {
      return (
        success: false,
        switched: false,
        error: switchResult.error ?? 'Failed to switch to another account',
      );
    }

    final switchedStore = await _loadMultiAccountStore();
    final normalizedRemaining = switchedStore.accounts
        .where((account) => account.id != accountId)
        .toList();
    await _saveMultiAccountStore(
      switchedStore.copyWith(
        accounts: _sortAccountsByRecent(normalizedRemaining),
        activeAccountId: switchedStore.activeAccountId,
      ),
    );
    return (success: true, switched: true, error: null);
  }

  Future<void> updateActiveAccountWorkspaceContext(String workspaceId) async {
    final store = await _loadMultiAccountStore();
    final activeId = store.activeAccountId;
    if (activeId == null) {
      return;
    }

    final updatedAccounts = store.accounts.map((account) {
      if (account.id != activeId) {
        return account;
      }
      return account.copyWith(
        lastWorkspaceId: workspaceId,
        lastActiveAt: DateTime.now().millisecondsSinceEpoch,
      );
    }).toList();

    await _saveMultiAccountStore(
      store.copyWith(accounts: _sortAccountsByRecent(updatedAccounts)),
    );
  }

  Future<({bool switched, String? error})> signOutCurrentAccount() async {
    final activeId = await getActiveStoredAccountId();
    if (activeId == null) {
      await _client.auth.signOut();
      await _clearMultiAccountStore();
      return (switched: false, error: null);
    }

    final result = await removeStoredAccount(activeId);
    if (!result.success) {
      return (switched: false, error: result.error ?? 'Failed to sign out');
    }
    return (switched: result.switched, error: null);
  }

  Future<void> signOutAllAccounts() async {
    try {
      await _googleIdentityClient.signOut();
    } on Exception {
      // Ignore Google sign-out failures and still clear auth state.
    }

    await _client.auth.signOut();
    await _clearMultiAccountStore();
  }

  // ── OTP ─────────────────────────────────────────

  Future<({bool success, String? error, int? retryAfter})> sendOtp(
    String email, {
    String? captchaToken,
  }) async {
    try {
      final deviceId = await getDeviceId();
      final response = await _apiClient.postJson(
        AuthEndpoints.otpSend,
        {
          'client': 'mobile',
          'email': email,
          'locale': getLocale(),
          'platform': _mobileOtpPlatform,
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
      final response = await _apiClient.postJson(
        AuthEndpoints.otpVerify,
        {
          'client': 'mobile',
          'email': email,
          'locale': getLocale(),
          'otp': otp,
          'platform': _mobileOtpPlatform,
          if (deviceId != null) 'deviceId': deviceId,
        },
        requiresAuth: false,
      );

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
      final response = await _apiClient.postJson(
        AuthEndpoints.passwordLogin,
        {
          'client': 'mobile',
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

  Future<AuthActionResult> signInWithMicrosoft() {
    return _launchBrowserOAuthSignIn(
      provider: OAuthProvider.azure,
      queryParams: const {},
      scopes: 'email',
      errorCode: AuthErrorCode.microsoftBrowserLaunchFailed,
    );
  }

  Future<AuthActionResult> signInWithApple() async {
    if (_shouldTryNativeAppleSignIn()) {
      final nativeResult = await _tryNativeAppleSignIn();
      if (nativeResult != null) {
        return nativeResult;
      }
    }

    return _launchBrowserOAuthSignIn(
      provider: OAuthProvider.apple,
      queryParams: const {'prompt': 'consent'},
      errorCode: AuthErrorCode.appleBrowserLaunchFailed,
    );
  }

  Future<AuthActionResult> signInWithGithub() {
    return _launchBrowserOAuthSignIn(
      provider: OAuthProvider.github,
      queryParams: const {},
      errorCode: AuthErrorCode.githubBrowserLaunchFailed,
    );
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

  bool _shouldTryNativeAppleSignIn() => _devicePlatform.isIOS;

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
      if (_shouldFallbackToBrowserFromNativeError(e.code)) {
        return null;
      }

      if (e.code == GoogleSignInExceptionCode.canceled) {
        return const AuthActionResult.cancelled();
      }

      return AuthActionResult.failure(
        AuthErrorCode.googleSignInFailed,
        errorMessage: e.description,
      );
    } on Exception catch (e) {
      return AuthActionResult.failure(
        AuthErrorCode.googleSignInFailed,
        errorMessage: e.toString(),
      );
    }
  }

  Future<AuthActionResult?> _tryNativeAppleSignIn() async {
    try {
      if (!await _appleIdentityClient.isAvailable()) {
        return null;
      }

      final tokens = await _appleIdentityClient.authenticate();
      return await _completeNativeAppleSignIn(tokens);
    } on SignInWithAppleAuthorizationException catch (e) {
      if (e.code == AuthorizationErrorCode.canceled) {
        return const AuthActionResult.cancelled();
      }

      return AuthActionResult.failure(
        AuthErrorCode.appleSignInFailed,
        errorMessage: e.message,
      );
    } on SignInWithAppleNotSupportedException {
      return null;
    } on AuthException catch (e) {
      return AuthActionResult.failure(
        AuthErrorCode.appleSignInFailed,
        errorMessage: e.message,
      );
    } on Exception catch (e) {
      return AuthActionResult.failure(
        AuthErrorCode.appleSignInFailed,
        errorMessage: e.toString(),
      );
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
    } on AuthException catch (e) {
      return AuthActionResult.failure(
        AuthErrorCode.googleSignInFailed,
        errorMessage: e.message,
      );
    } on Exception catch (e) {
      return AuthActionResult.failure(
        AuthErrorCode.googleSignInFailed,
        errorMessage: e.toString(),
      );
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
          await _client.auth.updateUser(
            UserAttributes(
              data: metadata,
            ),
          );
        } on AuthException {
          // Apple only returns name fields on the first authorization.
          // Do not fail sign-in if persisting that optional metadata fails.
        }
      }

      return const AuthActionResult.success();
    } on AuthException catch (e) {
      return AuthActionResult.failure(
        AuthErrorCode.appleSignInFailed,
        errorMessage: e.message,
      );
    } on Exception catch (e) {
      return AuthActionResult.failure(
        AuthErrorCode.appleSignInFailed,
        errorMessage: e.toString(),
      );
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

  bool _shouldFallbackToBrowserFromNativeError(
    GoogleSignInExceptionCode code,
  ) {
    return switch (code) {
      GoogleSignInExceptionCode.clientConfigurationError ||
      GoogleSignInExceptionCode.providerConfigurationError ||
      GoogleSignInExceptionCode.uiUnavailable => true,
      // google_sign_in on Android can surface Credential Manager
      // configuration failures as "canceled" after the user picks an account.
      // Fall back to browser OAuth there instead of silently doing nothing.
      GoogleSignInExceptionCode.canceled => _devicePlatform.isAndroid,
      GoogleSignInExceptionCode.unknownError ||
      GoogleSignInExceptionCode.interrupted ||
      GoogleSignInExceptionCode.userMismatch => false,
    };
  }

  Future<AuthActionResult> _launchBrowserGoogleSignIn() async {
    return _launchBrowserOAuthSignIn(
      provider: OAuthProvider.google,
      queryParams: const {
        'access_type': 'offline',
        'prompt': 'consent',
      },
      errorCode: AuthErrorCode.googleBrowserLaunchFailed,
    );
  }

  Future<AuthActionResult> _launchBrowserOAuthSignIn({
    required OAuthProvider provider,
    required Map<String, String> queryParams,
    required AuthErrorCode errorCode,
    String? scopes,
  }) async {
    try {
      final redirectTo = await _buildAuthRedirectUrl();
      final launched = await _oauthUrlLauncher.launchProviderSignIn(
        authClient: _client.auth,
        provider: provider,
        redirectTo: redirectTo,
        queryParams: queryParams,
        scopes: scopes,
      );

      if (!launched) {
        return AuthActionResult.failure(errorCode);
      }

      return const AuthActionResult.externalFlowStarted();
    } on Exception catch (e) {
      return AuthActionResult.failure(errorCode, errorMessage: e.toString());
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
    await _clearMultiAccountStore();
  }

  Future<void> refreshSession() async {
    await _client.auth.refreshSession();
  }

  void dispose() {
    _apiClient.dispose();
  }
}
