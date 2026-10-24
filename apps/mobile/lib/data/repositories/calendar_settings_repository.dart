import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/data/repositories/calendar_settings_cache.dart';
import 'package:mobile/data/repositories/timezone_settings_repository.dart';
import 'package:mobile/data/sources/api_client.dart';

/// Week-start preferences share the authenticated Calendar settings contract.
class CalendarSettingsRepository {
  CalendarSettingsRepository({
    ApiClient? apiClient,
    CacheStore? cacheStore,
    String? Function()? userId,
  }) : _api = apiClient ?? ApiClient(),
       _ownsApi = apiClient == null,
       _cache = CalendarSettingsCache(
         namespace: 'settings.calendar.weekStart',
         store: cacheStore,
         userId: userId,
       );

  final ApiClient _api;
  final bool _ownsApi;
  final CalendarSettingsCache _cache;

  Future<String?> snapshot(String actor, String? workspaceId) =>
      _cache.snapshot(actor, workspaceId);

  void fence(String actor, String? workspaceId) =>
      _cache.fence(actor, workspaceId);

  Future<String> read(String actor, String? workspaceId) => _cache.fetch(
    actor: actor,
    workspaceId: workspaceId,
    request: () => ApiClient.runForUser(
      actor,
      () async => _parse(await _api.getJson(_path(workspaceId))),
    ),
  );

  Future<String> savePersonal(String actor, String value) => _cache.fetch(
    actor: actor,
    workspaceId: null,
    purgeOnDenied: false,
    request: () => ApiClient.runForUser(
      actor,
      () async => _parse(
        await _api.patchJson(_path(null), {'first_day_of_week': value}),
      ),
    ),
  );

  static String _path(String? workspaceId) => workspaceId == null
      ? TimezoneSettingsRepository.personalPath
      : TimezoneSettingsRepository.workspacePath(workspaceId);

  static String _parse(Map<String, dynamic> data) {
    final value = data['first_day_of_week'];
    if (value == 'auto' ||
        value == 'sunday' ||
        value == 'monday' ||
        value == 'saturday') {
      return value! as String;
    }
    throw const FormatException('Invalid first-day-of-week response');
  }

  void dispose() {
    _cache.dispose();
    if (_ownsApi) _api.dispose();
  }
}
