import 'dart:async';
import 'dart:convert';
import 'dart:developer' as developer;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/core/constants/storage_keys.dart';
import 'package:mobile/data/models/multi_account_store.dart';
import 'package:mobile/data/models/stored_account_switch_result.dart';
import 'package:mobile/data/models/stored_auth_account.dart';
import 'package:mobile/data/models/user_profile.dart';
import 'package:mobile/data/repositories/stored_session_restore.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/data/sources/google_identity_client.dart';
import 'package:mobile/data/sources/mobile_client_credential.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

typedef StoredAccountRemovalResult = ({
  bool success,
  bool switched,
  String? error,
  bool revocationUnconfirmed,
});

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
  final Set<String> _removingAccountIds = {};
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

  Future<void> clearMultiAccountStore() => _editStore(() async {
    await MobileClientCredentials.instance.clearAll();
    await _secureStorage.delete(key: StorageKeys.multiAccountStore);
  });

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
    if (_removingAccountIds.contains(accountId)) {
      return StoredAccountSwitchResult.failed;
    }
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
        _removingAccountIds.contains(target.id) ||
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

  Future<StoredAccountRemovalResult> removeStoredAccount(
    String accountId,
  ) async {
    if (!_removingAccountIds.add(accountId)) {
      return _removalFailed('Account removal is already in progress');
    }
    try {
      return await _removeStoredAccount(accountId);
    } finally {
      _removingAccountIds.remove(accountId);
    }
  }

  Future<StoredAccountRemovalResult> _removeStoredAccount(
    String accountId,
  ) async {
    final store = await _loadMultiAccountStore();
    final target = store.accounts.where((a) => a.id == accountId).firstOrNull;
    final liveActor = _client.auth.currentUser?.id;
    if (target == null && liveActor != accountId) {
      return _removalFailed('Account not found');
    }

    final wasActive = (liveActor ?? store.activeAccountId) == accountId;
    final liveToken = liveActor == accountId
        ? _client.auth.currentSession?.refreshToken
        : null;
    final revocationUnconfirmed = !await _revokeStoredDeviceSession(
      liveToken ?? target?.refreshToken ?? '',
    );

    var switched = false;
    if (wasActive) {
      final fallback = _sortAccountsByRecent(
        store.accounts,
      ).where((account) => account.id != accountId).firstOrNull;
      if (fallback != null) {
        switched = (await switchToStoredAccount(fallback.id)).success;
      }
      if (!switched && _client.auth.currentUser?.id == accountId) {
        final signOutError = await _signOutSupabase(
          logMessage: 'Supabase sign-out failed during account removal',
          timeout: const Duration(seconds: 5),
        );
        if (signOutError != null && _client.auth.currentUser?.id == accountId) {
          return _removalFailed(signOutError);
        }
        await _googleSignOutBestEffort();
      }
    }

    final removed = await _deleteStoredAccount(accountId);
    return removed
        ? (
            success: true,
            switched: switched,
            error: null,
            revocationUnconfirmed: revocationUnconfirmed,
          )
        : _removalFailed('Account changed during removal');
  }

  StoredAccountRemovalResult _removalFailed(String error) => (
    success: false,
    switched: false,
    error: error,
    revocationUnconfirmed: false,
  );

  Future<bool> _deleteStoredAccount(String accountId) => _editStore(() async {
    final store = await _loadMultiAccountStore();
    if (_client.auth.currentUser?.id == accountId) return false;
    await MobileClientCredentials.instance.clear(accountId);
    final remaining = store.accounts.where((a) => a.id != accountId).toList();
    if (remaining.isEmpty) {
      await _secureStorage.delete(key: StorageKeys.multiAccountStore);
      return true;
    }
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

  Future<StoredAccountRemovalResult> signOutCurrentAccount() async {
    final activeId =
        _client.auth.currentUser?.id ?? await getActiveStoredAccountId();
    if (activeId != null) return await removeStoredAccount(activeId);

    final signOutError = await _signOutSupabase(
      logMessage: 'Supabase sign-out failed during current account sign-out',
    );
    if (signOutError != null) return _removalFailed(signOutError);
    await clearMultiAccountStore();
    return (
      success: true,
      switched: false,
      error: null,
      revocationUnconfirmed: false,
    );
  }

  Future<({bool success, String? error})> signOutAllAccounts() async {
    final store = await _loadMultiAccountStore();
    for (final account in store.accounts) {
      if (account.id == _client.auth.currentUser?.id) continue;
      if (!await _revokeStoredDeviceSession(account.refreshToken)) {
        developer.log(
          'Stored device session revocation could not be confirmed',
          name: 'MultiAccountStorageService',
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
    } on Object {
      // Ignore Google sign-out failures and continue account cleanup.
    }
  }

  Future<bool> _revokeStoredDeviceSession(String refreshToken) async {
    if (refreshToken.trim().isEmpty) return true;
    final client = _refreshHttpClient ?? http.Client();

    try {
      final authUrl = Uri.parse(_client.rest.url).resolve('../auth/v1');
      final apiKey = _client.auth.headers['apikey']!;

      Future<http.Response> post(
        String path,
        Map<String, String> query,
        Map<String, String> body, {
        String? accessToken,
      }) {
        final request =
            http.Request(
                'POST',
                authUrl.replace(
                  path: '${authUrl.path}/$path',
                  queryParameters: query,
                ),
              )
              ..followRedirects = false
              ..headers.addAll({
                'apikey': apiKey,
                'Content-Type': 'application/json',
                if (accessToken != null) 'Authorization': 'Bearer $accessToken',
              })
              ..body = jsonEncode(body);
        return client
            .send(request)
            .then(http.Response.fromStream)
            .timeout(const Duration(seconds: 4));
      }

      final exchange = await post(
        'token',
        {'grant_type': 'refresh_token'},
        {'grant_type': 'refresh_token', 'refresh_token': refreshToken},
      );
      if (_isRevokedSession(exchange)) return true;
      if (!_isSuccess(exchange)) return false;
      final payload = jsonDecode(exchange.body);
      final accessToken = payload is Map<String, dynamic>
          ? payload['access_token']
          : null;
      if (accessToken is! String || accessToken.isEmpty) return false;

      final logout = await post(
        'logout',
        {'scope': 'local'},
        {'refresh_token': refreshToken},
        accessToken: accessToken,
      );
      return _isSuccess(logout) || _isRevokedSession(logout);
    } on Object {
      return false;
    } finally {
      if (_refreshHttpClient == null) client.close();
    }
  }

  bool _isSuccess(http.Response response) =>
      response.statusCode >= 200 && response.statusCode < 300;

  bool _isRevokedSession(http.Response response) {
    if (response.statusCode == 401) return true;
    if (response.statusCode != 400) return false;
    final payload = jsonDecode(response.body);
    return payload is Map<String, dynamic> &&
        const {
          'invalid_grant',
          'session_not_found',
          'session_expired',
        }.contains(
          payload['error_code'] ?? payload['code'] ?? payload['error'],
        );
  }

  Future<String?> _signOutSupabase({
    required String logMessage,
    Duration? timeout,
  }) async {
    try {
      final logout = _client.auth.signOut();
      await (timeout == null ? logout : logout.timeout(timeout));
      return null;
    } on AuthException catch (error) {
      developer.log(logMessage, name: 'MultiAccountStorageService', level: 900);
      return error.message;
    } on Object {
      developer.log(logMessage, name: 'MultiAccountStorageService', level: 900);
      return 'Sign-out failed';
    }
  }
}
