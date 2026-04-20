import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/core/config/env.dart';
import 'package:mobile/core/constants/storage_keys.dart';
import 'package:mobile/data/models/multi_account_store.dart';
import 'package:mobile/data/models/stored_auth_account.dart';
import 'package:mobile/data/models/user_profile.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/data/sources/google_identity_client.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class MultiAccountStorageService {
  MultiAccountStorageService({
    required SupabaseClient supabaseClient,
    required FlutterSecureStorage secureStorage,
    required ApiClient apiClient,
    required GoogleIdentityClient googleIdentityClient,
  }) : _client = supabaseClient,
       _secureStorage = secureStorage,
       _apiClient = apiClient,
       _googleIdentityClient = googleIdentityClient;

  final SupabaseClient _client;
  final FlutterSecureStorage _secureStorage;
  final ApiClient _apiClient;
  final GoogleIdentityClient _googleIdentityClient;

  static const int _multiAccountStoreVersion = 1;
  static const int _maxStoredAccounts = 5;

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

  Future<void> clearMultiAccountStore() async {
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

  Future<UserProfile?> _fetchCurrentUserProfile() async {
    try {
      final json = await _apiClient.getJson(ProfileEndpoints.profile);
      return UserProfile.fromJson(json);
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
    final apiProfile = await _fetchCurrentUserProfile();

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
  }

  Future<({bool success, String? error})> completeAddAccountFlow() async {
    try {
      final session = _client.auth.currentSession;
      final user = _client.auth.currentUser;
      if (session == null || user == null) {
        return (success: false, error: 'No active session found');
      }

      final sessionJson = await _readCurrentPersistedSessionJson();
      final store = await _loadMultiAccountStore();
      final now = DateTime.now().millisecondsSinceEpoch;
      final existingIndex = store.accounts.indexWhere((a) => a.id == user.id);
      final apiProfile = await _fetchCurrentUserProfile();

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
            apiProfile: apiProfile,
          );
      } else {
        updated = [
          ...store.accounts,
          _accountFromCurrentSession(
            user: user,
            session: session,
            sessionJson: sessionJson,
            apiProfile: apiProfile,
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
    } on AuthException catch (e) {
      return (success: false, error: e.message);
    } on Object catch (e) {
      return (success: false, error: e.toString());
    }
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
      final apiProfile = await _fetchCurrentUserProfile();
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
          apiProfile: apiProfile,
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
      await _googleSignOutBestEffort();
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
      await clearMultiAccountStore();
      return (switched: false, error: null);
    }

    final result = await removeStoredAccount(activeId);
    if (!result.success) {
      return (switched: false, error: result.error ?? 'Failed to sign out');
    }
    return (switched: result.switched, error: null);
  }

  Future<void> signOutAllAccounts() async {
    final store = await _loadMultiAccountStore();
    for (final account in store.accounts) {
      try {
        await _revokeRefreshTokenGlobally(account.refreshToken);
      } on Object {
        // Best-effort sign-out for each account; continue revocation loop.
      }
    }

    await _googleSignOutBestEffort();
    await _client.auth.signOut();
    await clearMultiAccountStore();
  }

  Future<void> _googleSignOutBestEffort() async {
    try {
      await _googleIdentityClient.signOut();
    } on Exception {
      // Ignore Google sign-out failures and continue account cleanup.
    }
  }

  Future<void> _revokeRefreshTokenGlobally(String refreshToken) async {
    if (refreshToken.trim().isEmpty) {
      return;
    }

    final logoutUri = Uri.parse(
      '${Env.supabaseUrl}/auth/v1/logout?scope=global',
    );
    await http.post(
      logoutUri,
      headers: {
        'apikey': Env.supabaseAnonKey,
        'Authorization': 'Bearer $refreshToken',
        'Content-Type': 'application/json',
      },
      body: jsonEncode({'refresh_token': refreshToken}),
    );
  }
}
