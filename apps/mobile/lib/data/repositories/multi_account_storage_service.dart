import 'dart:async';
import 'dart:convert';
import 'dart:developer' as developer;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/core/config/env.dart';
import 'package:mobile/core/constants/storage_keys.dart';
import 'package:mobile/data/models/multi_account_store.dart';
import 'package:mobile/data/models/stored_account_switch_result.dart';
import 'package:mobile/data/models/stored_auth_account.dart';
import 'package:mobile/data/models/user_profile.dart';
import 'package:mobile/data/repositories/stored_session_restore.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/data/sources/google_identity_client.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class MultiAccountStorageService {
  MultiAccountStorageService({
    required SupabaseClient supabaseClient,
    required FlutterSecureStorage secureStorage,
    required ApiClient apiClient,
    required GoogleIdentityClient googleIdentityClient,
    http.Client? refreshHttpClient,
  }) : _client = supabaseClient,
       _secureStorage = secureStorage,
       _apiClient = apiClient,
       _googleIdentityClient = googleIdentityClient,
       _refreshHttpClient = refreshHttpClient;

  final SupabaseClient _client;
  final FlutterSecureStorage _secureStorage;
  final ApiClient _apiClient;
  final GoogleIdentityClient _googleIdentityClient;
  final http.Client? _refreshHttpClient;

  static const int _multiAccountStoreVersion = 1;
  static const int _maxStoredAccounts = 5;
  Future<void>? _syncInFlight;
  bool _syncRequested = false;
  Future<void> _storeWrites = Future<void>.value();

  Future<T> _editStore<T>(Future<T> Function() edit) {
    final result = _storeWrites.then((_) => edit());
    _storeWrites = result.then<void>((_) {}, onError: (Object _) {});
    return result;
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
      return MultiAccountStore.empty();
    }
  }

  Future<void> _saveMultiAccountStore(MultiAccountStore store) async {
    await _secureStorage.write(
      key: StorageKeys.multiAccountStore,
      value: jsonEncode(store.toJson()),
    );
  }

  Future<void> clearMultiAccountStore() => _editStore(
    () => _secureStorage.delete(key: StorageKeys.multiAccountStore),
  );

  String? _readDisplayName(User user) =>
      _nonEmptyTrimmed(user.userMetadata?['display_name']) ??
      _nonEmptyTrimmed(user.userMetadata?['full_name']);

  String? _readAvatarUrl(User user) =>
      _nonEmptyTrimmed(user.userMetadata?['avatar_url']);

  String? _nonEmptyTrimmed(Object? value) =>
      value is String && value.trim().isNotEmpty ? value.trim() : null;

  String? _primaryLabelFromProfile(UserProfile? profile) {
    if (profile == null) {
      return null;
    }
    final full = profile.fullName?.trim();
    if (full != null && full.isNotEmpty) {
      return full;
    }
    final display = profile.displayName?.trim();
    if (display != null && display.isNotEmpty) {
      return display;
    }
    return null;
  }

  Future<UserProfile?> _fetchCurrentUserProfile(String userId) async {
    try {
      final json = await ApiClient.runForUser(
        userId,
        () => _apiClient.getJson(ProfileEndpoints.profile),
      );
      final profile = UserProfile.fromJson(json);
      return profile.id == userId ? profile : null;
    } on Object {
      return null;
    }
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
    UserProfile? apiProfile,
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
          _readDisplayName(user) ??
          _primaryLabelFromProfile(apiProfile) ??
          _nonEmptyTrimmed(fallbackDisplayName),
      avatarUrl:
          _readAvatarUrl(user) ??
          _nonEmptyTrimmed(apiProfile?.avatarUrl) ??
          _nonEmptyTrimmed(fallbackAvatarUrl),
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
  }) {
    _syncRequested = true;
    return _syncInFlight ??= _drainSessionSync(
      switchImmediately,
    ).whenComplete(() => _syncInFlight = null);
  }

  Future<void> _drainSessionSync(bool switchImmediately) async {
    while (_syncRequested) {
      _syncRequested = false;
      await _syncCurrentSessionToMultiAccountStore(
        switchImmediately: switchImmediately,
      );
    }
  }

  Future<void> _syncCurrentSessionToMultiAccountStore({
    bool switchImmediately = true,
  }) async {
    final initialUserId = _client.auth.currentUser?.id;
    if (initialUserId == null) return;
    final apiProfile = await _fetchCurrentUserProfile(initialUserId);
    await _persistCurrentSession(
      initialUserId,
      switchImmediately: switchImmediately,
      apiProfile: apiProfile,
    );
  }

  Future<bool> _persistCurrentSession(
    String expectedUserId, {
    bool switchImmediately = true,
    UserProfile? apiProfile,
  }) => _editStore(() async {
    final store = await _loadMultiAccountStore();
    final session = _client.auth.currentSession;
    final user = _client.auth.currentUser;
    if (session == null || user == null || user.id != expectedUserId) {
      return false;
    }

    final sessionJson = jsonEncode(session.toJson());
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
        apiProfile: apiProfile,
      );
      updated = [...store.accounts]..[existingIndex] = refreshed;
    } else {
      final appended = _accountFromCurrentSession(
        user: user,
        session: session,
        sessionJson: sessionJson,
        apiProfile: apiProfile,
      );
      updated = [...store.accounts, appended];
    }

    final sorted = _sortAccountsByRecent(updated);
    final trimmed = sorted.take(_maxStoredAccounts).toList();
    final isCurrentKept = trimmed.any((account) => account.id == user.id);

    var nextActiveId = switchImmediately
        ? (isCurrentKept ? user.id : trimmed.firstOrNull?.id)
        : (store.activeAccountId ?? (isCurrentKept ? user.id : null));
    if (nextActiveId != null &&
        !trimmed.any((account) => account.id == nextActiveId)) {
      nextActiveId = isCurrentKept ? user.id : trimmed.firstOrNull?.id;
    }

    await _saveMultiAccountStore(
      store.copyWith(accounts: trimmed, activeAccountId: nextActiveId),
    );
    return true;
  });

  Future<({bool success, String? error})> completeAddAccountFlow() async {
    try {
      final userId = _client.auth.currentUser?.id;
      if (userId == null || !await _persistCurrentSession(userId)) {
        return (success: false, error: 'No active session found');
      }
      return (success: true, error: null);
    } on Object {
      return (success: false, error: 'Failed to save account');
    }
  }

  Future<StoredAccountSwitchResult> switchToStoredAccount(
    String accountId, {
    Future<void> Function()? beforeActivate,
  }) async {
    final origin = _client.auth.currentUser?.id;
    final store = await _loadMultiAccountStore();
    final target = store.accounts.where((a) => a.id == accountId).firstOrNull;
    if (target == null) return StoredAccountSwitchResult.failed;

    try {
      final saved = readStoredSession(target);
      final reuseSaved =
          saved != null &&
          !saved.isExpired &&
          saved.refreshToken?.isNotEmpty == true;
      final candidate = reuseSaved
          ? saved
          : await refreshStoredSession(
              authUrl: Uri.parse(_client.rest.url).resolve('../auth/v1'),
              apiKey: _client.auth.headers['apikey']!,
              refreshToken: target.refreshToken,
              httpClient: _refreshHttpClient,
            );
      if (candidate == null) return StoredAccountSwitchResult.signInRequired;
      if (candidate.user.id != accountId ||
          _client.auth.currentUser?.id != origin) {
        return StoredAccountSwitchResult.failed;
      }
      // Preserve rotated credentials even when cleanup or activation fails.
      final prepared = reuseSaved
          ? target
          : await _rememberRefresh(target, candidate);
      if (prepared == null) return StoredAccountSwitchResult.failed;
      await beforeActivate?.call();
      return await _activateStoredSession(prepared, candidate, origin);
    } on Object {
      return StoredAccountSwitchResult.failed;
    }
  }

  Future<StoredAuthAccount?> _rememberRefresh(
    StoredAuthAccount target,
    Session candidate,
  ) => _editStore(() async {
    final store = await _loadMultiAccountStore();
    final latest = store.accounts.where((a) => a.id == target.id).firstOrNull;
    if (latest == null || latest.refreshToken != target.refreshToken) {
      return null;
    }
    final updated = _updatedSession(latest, candidate);
    await _saveMultiAccountStore(
      store.copyWith(
        accounts: [
          for (final account in store.accounts)
            if (account.id == target.id) updated else account,
        ],
      ),
    );
    return updated;
  });

  Future<StoredAccountSwitchResult> _activateStoredSession(
    StoredAuthAccount target,
    Session candidate,
    String? origin,
  ) => _editStore(() async {
    final store = await _loadMultiAccountStore();
    final latest = store.accounts.where((a) => a.id == target.id).firstOrNull;
    final current = _client.auth.currentSession;
    if (latest == null ||
        latest.refreshToken != target.refreshToken ||
        current?.user.id != origin ||
        candidate.isExpired) {
      return StoredAccountSwitchResult.failed;
    }
    final updated = [
      for (final account in store.accounts)
        if (account.id == target.id)
          _updatedSession(account, candidate, active: true)
        else if (current != null && account.id == current.user.id)
          _updatedSession(account, current)
        else
          account,
      if (current != null &&
          current.refreshToken?.isNotEmpty == true &&
          !store.accounts.any((account) => account.id == current.user.id))
        _accountFromCurrentSession(
          user: current.user,
          session: current,
          sessionJson: jsonEncode(current.toJson()),
          lastActiveAt: DateTime.now().millisecondsSinceEpoch - 1,
        ),
    ];
    final sessionJson = jsonEncode(candidate.toJson());
    final saved = store.copyWith(
      accounts: _sortAccountsByRecent(
        updated,
      ).take(_maxStoredAccounts).toList(),
    );
    // Secure storage must contain any rotated credentials before SDK adoption.
    await _saveMultiAccountStore(saved.copyWith(activeAccountId: target.id));
    try {
      if (!identical(_client.auth.currentSession, current) ||
          _client.auth.currentUser?.id != origin ||
          candidate.isExpired) {
        return StoredAccountSwitchResult.failed;
      }
      await _client.auth.recoverSession(sessionJson);
      return _client.auth.currentUser?.id == target.id
          ? StoredAccountSwitchResult.switched
          : StoredAccountSwitchResult.failed;
    } finally {
      if (_client.auth.currentUser?.id != target.id) {
        await _saveMultiAccountStore(saved);
      }
    }
  });

  StoredAuthAccount _updatedSession(
    StoredAuthAccount account,
    Session session, {
    bool active = false,
  }) => account.copyWith(
    refreshToken: session.refreshToken,
    email: session.user.email ?? account.email,
    sessionJson: jsonEncode(session.toJson()),
    lastActiveAt: active ? DateTime.now().millisecondsSinceEpoch : null,
  );

  Future<({bool success, bool switched, String? error})> removeStoredAccount(
    String accountId,
  ) async {
    final store = await _loadMultiAccountStore();
    final accountExists = store.accounts.any(
      (account) => account.id == accountId,
    );
    if (!accountExists && _client.auth.currentUser?.id != accountId) {
      return (success: false, switched: false, error: 'Account not found');
    }

    final remaining = store.accounts
        .where((account) => account.id != accountId)
        .toList();

    final wasActive =
        (_client.auth.currentUser?.id ?? store.activeAccountId) == accountId;
    if (!wasActive) {
      final removed = await _removeInactiveAccount(accountId);
      return (
        success: removed,
        switched: false,
        error: removed ? null : 'Account changed during removal',
      );
    }

    if (remaining.isEmpty) {
      final signOutError = await _signOutSupabase(
        logMessage: 'Supabase sign-out failed while removing final account',
      );
      if (signOutError != null) {
        return (success: false, switched: false, error: signOutError);
      }

      try {
        await _googleSignOutBestEffort();
      } on Object catch (error, stackTrace) {
        developer.log(
          'Google sign-out failed while removing final account',
          name: 'MultiAccountStorageService',
          error: error,
          stackTrace: stackTrace,
          level: 900,
        );
      }
      await clearMultiAccountStore();
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

    final removed = await _removeInactiveAccount(accountId);
    return (
      success: removed,
      switched: true,
      error: removed ? null : 'Account changed during removal',
    );
  }

  Future<bool> _removeInactiveAccount(String accountId) => _editStore(() async {
    final store = await _loadMultiAccountStore();
    if (_client.auth.currentUser?.id == accountId) return false;
    final remaining = store.accounts.where((a) => a.id != accountId).toList();
    final activeId = _client.auth.currentUser?.id ?? store.activeAccountId;
    await _saveMultiAccountStore(
      store.copyWith(
        accounts: remaining,
        activeAccountId: remaining.any((a) => a.id == activeId)
            ? activeId
            : remaining.firstOrNull?.id,
      ),
    );
    return true;
  });

  Future<void> updateActiveAccountWorkspaceContext(String workspaceId) {
    final actor = _client.auth.currentUser?.id;
    return _editStore(() async {
      final store = await _loadMultiAccountStore();
      if (actor == null || actor != _client.auth.currentUser?.id) return;
      final updated = [
        for (final account in store.accounts)
          if (account.id == actor)
            account.copyWith(lastWorkspaceId: workspaceId)
          else
            account,
      ];
      await _saveMultiAccountStore(store.copyWith(accounts: updated));
    });
  }

  Future<({bool switched, String? error})> signOutCurrentAccount() async {
    final activeId =
        _client.auth.currentUser?.id ?? await getActiveStoredAccountId();
    if (activeId == null) {
      final signOutError = await _signOutSupabase(
        logMessage: 'Supabase sign-out failed during current account sign-out',
      );
      if (signOutError != null) {
        return (switched: false, error: signOutError);
      }
      await clearMultiAccountStore();
      return (switched: false, error: null);
    }

    final result = await removeStoredAccount(activeId);
    if (!result.success) {
      return (switched: false, error: result.error ?? 'Failed to sign out');
    }
    return (switched: result.switched, error: null);
  }

  Future<({bool success, String? error})> signOutAllAccounts() async {
    final store = await _loadMultiAccountStore();
    for (final account in store.accounts) {
      if (account.id == _client.auth.currentUser?.id) continue;
      try {
        await _revokeStoredDeviceSession(account.refreshToken);
      } on Object catch (error, stackTrace) {
        developer.log(
          'Failed to revoke stored account refresh token',
          name: 'MultiAccountStorageService',
          error: error,
          stackTrace: stackTrace,
          level: 900,
        );
      }
    }

    try {
      await _googleSignOutBestEffort();
    } on Object catch (error, stackTrace) {
      developer.log(
        'Google sign-out failed during signOutAllAccounts',
        name: 'MultiAccountStorageService',
        error: error,
        stackTrace: stackTrace,
        level: 900,
      );
    }

    final signOutError = await _signOutSupabase(
      logMessage: 'Supabase sign-out failed during signOutAllAccounts',
    );
    if (signOutError != null) {
      return (success: false, error: signOutError);
    }

    await clearMultiAccountStore();
    return (success: true, error: null);
  }

  Future<void> _googleSignOutBestEffort() async {
    try {
      await _googleIdentityClient.signOut();
    } on Exception {
      // Ignore Google sign-out failures and continue account cleanup.
    }
  }

  Future<void> _revokeStoredDeviceSession(String refreshToken) async {
    if (refreshToken.trim().isEmpty) {
      return;
    }

    final tokenUri = Uri.parse(
      '${Env.supabaseUrl}/auth/v1/token?grant_type=refresh_token',
    );
    final tokenResponse = await http.post(
      tokenUri,
      headers: {
        'apikey': Env.supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: jsonEncode({
        'grant_type': 'refresh_token',
        'refresh_token': refreshToken,
      }),
    );
    if (tokenResponse.statusCode < 200 || tokenResponse.statusCode >= 300) {
      throw AuthException(
        'Failed to exchange refresh token '
        '(${tokenResponse.statusCode}): ${tokenResponse.body}',
      );
    }

    final tokenBody = jsonDecode(tokenResponse.body);
    if (tokenBody is! Map<String, dynamic>) {
      throw const AuthException('Unexpected token exchange response payload');
    }
    final accessToken = tokenBody['access_token'] as String?;
    if (accessToken == null || accessToken.trim().isEmpty) {
      throw const AuthException('Token exchange did not return access_token');
    }

    final logoutUri = Uri.parse(
      '${Env.supabaseUrl}/auth/v1/logout?scope=local',
    );
    final logoutResponse = await http.post(
      logoutUri,
      headers: {
        'apikey': Env.supabaseAnonKey,
        'Authorization': 'Bearer $accessToken',
        'Content-Type': 'application/json',
      },
      body: jsonEncode({'refresh_token': refreshToken}),
    );
    if (logoutResponse.statusCode < 200 || logoutResponse.statusCode >= 300) {
      throw AuthException(
        'Failed to revoke stored device session '
        '(${logoutResponse.statusCode}): ${logoutResponse.body}',
      );
    }
  }

  Future<String?> _signOutSupabase({required String logMessage}) async {
    try {
      await _client.auth.signOut();
      return null;
    } on AuthException catch (error, stackTrace) {
      developer.log(
        logMessage,
        name: 'MultiAccountStorageService',
        error: error,
        stackTrace: stackTrace,
        level: 900,
      );
      return error.message;
    } on Object catch (error, stackTrace) {
      developer.log(
        logMessage,
        name: 'MultiAccountStorageService',
        error: error,
        stackTrace: stackTrace,
        level: 900,
      );
      return error.toString();
    }
  }
}
