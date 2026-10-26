import 'dart:async';

import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/repositories/calendar_settings_cache.dart';
import 'package:mobile/data/sources/api_client.dart';

/// Calendar preferences use the authenticated calendar satellite API.
class TimezoneSettingsRepository {
  TimezoneSettingsRepository({
    ApiClient? apiClient,
    DateTime Function()? clock,
    CacheStore? cacheStore,
    String? Function()? cacheUserId,
  }) : _api = apiClient ?? ApiClient(),
       _ownsApi = apiClient == null,
       _clock = clock ?? DateTime.now,
       _cache = CalendarSettingsCache(
         namespace: 'settings.calendar.timezone',
         store: cacheStore,
         userId: cacheUserId,
       );
  final ApiClient _api;
  final bool _ownsApi;
  final DateTime Function() _clock;
  final CalendarSettingsCache _cache;
  final _reads = <(String, String), Future<String>>{};
  final _requestEpochs = <String, int>{};
  final _cooldowns = <String, ({DateTime until, ApiException error})>{};
  static const missingRetryAfterCooldown = Duration(seconds: 30);
  static const personalPath = '/api/v1/users/calendar-settings';
  static String workspacePath(String id) =>
      '/api/v1/workspaces/${Uri.encodeComponent(id)}/calendar-settings';
  Future<String> loadPersonal() async =>
      _parse(await _api.getJson(personalPath));
  Future<String> loadWorkspace(String id) async =>
      _parse(await _api.getJson(workspacePath(id)));
  Future<String> savePersonal(String zone) async =>
      _parse(await _api.patchJson(personalPath, {'timezone': zone}));
  Future<String> saveWorkspace(String id, String zone) async =>
      _parse(await _api.patchJson(workspacePath(id), {'timezone': zone}));

  /// Coalesce only in-flight reads belonging to the same account and endpoint.
  /// Stored values are separate, encrypted, actor/workspace-scoped snapshots.
  Future<String> readPersonal(
    String userId, {
    Duration timeout = const Duration(seconds: 15),
  }) => _read(userId, null, personalPath, loadPersonal, timeout);
  Future<String> readWorkspace(
    String userId,
    String id, {
    Duration timeout = const Duration(seconds: 15),
  }) => _read(userId, id, workspacePath(id), () => loadWorkspace(id), timeout);
  Future<String> writePersonal(String userId, String zone) =>
      _write(userId, null, () => savePersonal(zone));
  Future<String> writeWorkspace(String userId, String id, String zone) =>
      _write(userId, id, () => saveWorkspace(id, zone));

  Future<String?> cachedPersonal(String userId) =>
      _cache.snapshot(userId, null);
  Future<String?> cachedWorkspace(String userId, String id) =>
      _cache.snapshot(userId, id);

  /// Detaches superseded loads before an A -> B -> A scope can reuse them.
  void fenceScope(String userId, String? workspaceId) {
    final path = workspaceId == null
        ? personalPath
        : workspacePath(workspaceId);
    unawaited(_reads.remove((userId, path)));
    _cache.fence(userId, workspaceId);
    _requestEpochs[userId] = (_requestEpochs[userId] ?? 0) + 1;
  }

  Future<String> _write(
    String userId,
    String? workspaceId,
    Future<String> Function() operation,
  ) {
    fenceScope(userId, workspaceId);
    return _cache.fetch(
      actor: userId,
      workspaceId: workspaceId,
      purgeOnDenied: false,
      request: () => _request(userId, operation),
    );
  }

  Future<String> _read(
    String userId,
    String? workspaceId,
    String path,
    Future<String> Function() read,
    Duration timeout,
  ) {
    final key = (userId, path);
    final existing = _reads[key];
    if (existing != null) return existing;
    late final Future<String> pending;
    // Expired reads stop being shared, allowing a fresh explicit retry.
    // The cache's resource generation rejects a superseded late response.
    pending = _cache
        .fetch(
          actor: userId,
          workspaceId: workspaceId,
          request: () => _request(userId, read),
        )
        .timeout(timeout)
        .whenComplete(() {
          _reads.removeWhere(
            (candidate, value) => candidate == key && identical(value, pending),
          );
        });
    _reads[key] = pending;
    return pending;
  }

  Future<String> _request(
    String userId,
    Future<String> Function() operation,
  ) async {
    final epoch = _requestEpochs[userId] ?? 0;
    final now = _clock();
    _cooldowns.removeWhere((_, value) => !value.until.isAfter(now));
    final cooldown = _cooldowns[userId];
    if (cooldown != null) {
      throw ApiException(
        message: cooldown.error.message,
        statusCode: 429,
        retryAfter:
            (cooldown.until.difference(now).inMicroseconds /
                    Duration.microsecondsPerSecond)
                .ceil(),
        code: cooldown.error.code,
        rateLimitDiagnostics: cooldown.error.rateLimitDiagnostics,
      );
    }
    try {
      return await ApiClient.runForUser(userId, operation);
    } on ApiException catch (error) {
      if (error.statusCode == 429 && epoch == (_requestEpochs[userId] ?? 0)) {
        final until = _clock().add(rateLimitDelay(error));
        final previous = _cooldowns[userId];
        if (previous == null || until.isAfter(previous.until)) {
          _cooldowns[userId] = (until: until, error: error);
        }
      }
      rethrow;
    }
  }

  static Duration rateLimitDelay(ApiException error) =>
      (error.retryAfter ?? 0) > 0
      ? Duration(seconds: error.retryAfter!)
      : missingRetryAfterCooldown;
  String _parse(Map<String, dynamic> data) =>
      (data['timezone'] as String?)?.trim().isNotEmpty == true
      ? (data['timezone'] as String).trim()
      : 'auto';
  void dispose() {
    _cache.dispose();
    _reads.clear();
    _requestEpochs.clear();
    _cooldowns.clear();
    if (_ownsApi) _api.dispose();
  }
}
