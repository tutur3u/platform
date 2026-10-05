import 'package:mobile/data/sources/api_client.dart';

/// Calendar preferences use the authenticated calendar satellite API.
class TimezoneSettingsRepository {
  TimezoneSettingsRepository({ApiClient? apiClient, DateTime Function()? clock})
    : _api = apiClient ?? ApiClient(),
      _ownsApi = apiClient == null,
      _clock = clock ?? DateTime.now;
  final ApiClient _api;
  final bool _ownsApi;
  final DateTime Function() _clock;
  final _reads = <(String, String), Future<String>>{};
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
  /// No preference value is cached across calls or account changes.
  Future<String> readPersonal(
    String userId, {
    Duration timeout = const Duration(seconds: 15),
  }) => _read(userId, personalPath, loadPersonal, timeout);
  Future<String> readWorkspace(
    String userId,
    String id, {
    Duration timeout = const Duration(seconds: 15),
  }) => _read(userId, workspacePath(id), () => loadWorkspace(id), timeout);
  Future<String> writePersonal(String userId, String zone) =>
      _request(userId, () => savePersonal(zone));
  Future<String> writeWorkspace(String userId, String id, String zone) =>
      _request(userId, () => saveWorkspace(id, zone));

  Future<String> _read(
    String userId,
    String path,
    Future<String> Function() read,
    Duration timeout,
  ) {
    final key = (userId, path);
    final existing = _reads[key];
    if (existing != null) return existing;
    late final Future<String> pending;
    // Expired reads stop being shared, allowing a fresh explicit retry.
    // The original transport may finish later but no result is cached here.
    pending = _request(userId, read).timeout(timeout).whenComplete(() {
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
      if (error.statusCode == 429) {
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
    _reads.clear();
    _cooldowns.clear();
    if (_ownsApi) _api.dispose();
  }
}
