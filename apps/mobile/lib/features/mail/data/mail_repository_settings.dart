part of 'mail_repository.dart';

abstract class MailSettingsRepository extends MailInvitationRepository {
  ApiClient get _settingsApi;
  MailCache get _settingsCache;
  OfflineMutationQueue get _settingsQueue;
  String? get _settingsUserId;
  String? Function() get _settingsCurrentUserId;
  final Map<String, Future<Map<String, dynamic>>> _settingsBootstrapRequests =
      {};

  void _checkSettingsScope() {
    if (_settingsUserId != _settingsCurrentUserId()) {
      throw const ApiException(message: 'Account changed', statusCode: 401);
    }
  }

  Future<T> _forSettingsActor<T>(Future<T> Function() action) async {
    _checkSettingsScope();
    final user = _settingsUserId;
    final value = await (user == null
        ? action()
        : ApiClient.runForUser(user, action));
    _checkSettingsScope();
    return value;
  }

  Future<Map<String, dynamic>> _fetchSettings(String wsId, String path) async {
    try {
      return await _forSettingsActor(() => _settingsApi.getJson(path));
    } on ApiException catch (error) {
      // MailCache's generic auth handling treats 403 as denial. A challenge
      // must retain the snapshot without turning it into fresh authorization.
      if (error.isVerificationRequired || error.code == 'MFA_REQUIRED') {
        throw _MailSettingsChallenge(error);
      }
      if (error.statusCode == 404) {
        await _settingsCache.denyAccess(wsId);
      }
      rethrow;
    }
  }

  Future<Map<String, dynamic>?> cachedSettingsAccounts(String wsId) async {
    _checkSettingsScope();
    final result = await _settingsCache.snapshot(wsId, 'settings-accounts');
    _checkSettingsScope();
    return result == null ? null : mailSettingsAccountsSnapshot(result);
  }

  /// Cached account rows never grant management; roles come from this read
  /// only.
  Future<Map<String, dynamic>> settingsBootstrap(String wsId) async {
    _checkSettingsScope();
    final existing = _settingsBootstrapRequests[wsId];
    if (existing != null) {
      return await existing;
    }
    final request = _refreshSettingsBootstrap(wsId);
    _settingsBootstrapRequests[wsId] = request;
    try {
      return await request;
    } finally {
      unawaited(_settingsBootstrapRequests.remove(wsId));
    }
  }

  Future<Map<String, dynamic>> _refreshSettingsBootstrap(String wsId) async {
    _checkSettingsScope();
    Map<String, dynamic>? fresh;
    try {
      final display = await _settingsCache.read(
        wsId,
        'settings-accounts',
        () async {
          fresh = await _fetchSettings(
            wsId,
            '${MailRepository.workspacePath(wsId)}/bootstrap',
          );
          return mailSettingsAccountsSnapshot(fresh!);
        },
        forceRefresh: true,
      );
      _checkSettingsScope();
      return fresh ?? mailSettingsAccountsSnapshot(display);
    } on _MailSettingsChallenge catch (challenge) {
      throw challenge.error;
    }
  }

  Future<Map<String, dynamic>?> cachedSettings(
    String wsId,
    String mailboxId,
  ) async {
    _checkSettingsScope();
    final path = '${MailRepository.mailboxPath(wsId, mailboxId)}/settings';
    final result = await _settingsCache.snapshot(wsId, path);
    if (_settingsUserId != null) {
      await _settingsQueue.init();
    }
    _checkSettingsScope();
    return result == null ? null : _overlaySettings(wsId, path, result);
  }

  Map<String, dynamic> _overlaySettings(
    String wsId,
    String path,
    Map<String, dynamic> source,
  ) => overlayPendingMailSettings(
    userId: _settingsUserId,
    workspaceId: wsId,
    path: path,
    source: mailSettingsSnapshot(source),
    pending: _settingsQueue.pending.value,
  );

  Future<Map<String, dynamic>> settings(String wsId, String mailboxId) async {
    _checkSettingsScope();
    final path = '${MailRepository.mailboxPath(wsId, mailboxId)}/settings';
    try {
      final result = await _settingsCache.read(
        wsId,
        path,
        () async => mailSettingsSnapshot(await _fetchSettings(wsId, path)),
        forceRefresh: true,
      );
      if (_settingsUserId != null) {
        await _settingsQueue.init();
      }
      _checkSettingsScope();
      return _overlaySettings(wsId, path, result);
    } on _MailSettingsChallenge catch (challenge) {
      throw challenge.error;
    }
  }

  Future<void> updateSettings(
    String wsId,
    String mailboxId,
    Map<String, dynamic> payload,
  ) async {
    _checkSettingsScope();
    // The endpoint stores absolute settings but has no operation receipt.
    // Unknown sends stay in manual review, retaining their original outbox id.
    final safePayload = Map<String, dynamic>.from(
      mailSettingsSnapshot({'settings': payload})['settings']
          as Map<String, dynamic>,
    );
    if (!payload.containsKey('groupPolicy')) {
      safePayload.remove('groupPolicy');
    }
    if (payload.containsKey('signatureHtml')) {
      safePayload['signatureHtml'] = payload['signatureHtml'];
    }
    final path = '${MailRepository.mailboxPath(wsId, mailboxId)}/settings';
    await queueOrSendVoid(
      feature: 'mail',
      method: 'PATCH',
      path: path,
      workspaceId: wsId,
      entityId: mailSettingsEntityId(mailboxId),
      payload: safePayload,
      queue: _settingsQueue,
      expectedUserId: _settingsUserId,
      send: () => _forSettingsActor(
        () => _settingsCache.mutate(wsId, () async {
          final Map<String, dynamic> result;
          try {
            result = await _settingsApi.patchJson(path, safePayload);
          } on ApiException catch (error) {
            _checkSettingsScope();
            if (!error.isVerificationRequired &&
                error.code != 'MFA_REQUIRED' &&
                (error.statusCode == 401 ||
                    error.statusCode == 403 ||
                    error.statusCode == 404)) {
              await _settingsCache.denyAccess(wsId);
            }
            rethrow;
          }
          _checkSettingsScope();
          try {
            await _settingsCache.saveSnapshot(
              wsId,
              path,
              mailSettingsSnapshot(result),
            );
          } on FormatException {
            // The write is acknowledged; the next read owns reconciliation.
          }
        }),
      ),
    );
    _checkSettingsScope();
  }
}

class _MailSettingsChallenge implements Exception {
  const _MailSettingsChallenge(this.error);
  final ApiException error;
}
