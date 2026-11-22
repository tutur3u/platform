import 'package:mobile/core/theme/sorbet/sorbet_preferences.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// The two Sorbet account configs, which sync on their own.
enum SorbetField { enabled, theme }

/// Sorbet preferences shared with the web apps.
///
/// The account stores `EXPERIMENTAL_SORBET_UI` ('true'/'false') and
/// `SORBET_THEME` (compact JSON) in `user_configs` through
/// `/api/v1/users/me/configs/{id}`. Requests are pinned to the given user,
/// so an account switch mid-request fails instead of crossing accounts.
/// A per-user device cache applies the last known values on launch, and
/// records which fields still need uploading.
class SorbetPreferencesRepository {
  SorbetPreferencesRepository({ApiClient? apiClient})
    : _api = apiClient ?? ApiClient();

  static const _configs = '/api/v1/users/me/configs';
  static const _signedOutKey = 'device';

  final ApiClient _api;

  static String _owner(String? userId) => userId ?? _signedOutKey;
  static String _enabledKey(String? userId) => 'sorbet-ui:${_owner(userId)}';
  static String _themeKey(String? userId) => 'sorbet-theme:${_owner(userId)}';
  static String _pendingKey(String userId) => 'sorbet-pending:$userId';

  /// Reads the account values, with Sorbet and its default theme when unset.
  Future<SorbetPreferences> loadAccount(String userId) async {
    final values = await ApiClient.runForUser(
      userId,
      () => Future.wait([
        _api.getJson('$_configs/${SorbetConfigIds.enabled}'),
        _api.getJson('$_configs/${SorbetConfigIds.theme}'),
      ]),
    );
    return SorbetPreferences(
      enabled: parseSorbetEnabled(values[0]['value']),
      theme: SorbetTheme.parse(values[1]['value']),
    );
  }

  Future<void> saveEnabled(String userId, {required bool enabled}) =>
      ApiClient.runForUser(
        userId,
        () => _api.putJson('$_configs/${SorbetConfigIds.enabled}', {
          'value': enabled ? 'true' : 'false',
        }),
      );

  Future<void> saveTheme(String userId, SorbetTheme theme) =>
      ApiClient.runForUser(
        userId,
        () => _api.putJson('$_configs/${SorbetConfigIds.theme}', {
          'value': theme.serialize(),
        }),
      );

  /// The cached values for [userId] (null: signed out), or null when this
  /// device has none yet.
  Future<SorbetPreferences?> readCache(String? userId) async {
    final prefs = await SharedPreferences.getInstance();
    final enabled = prefs.getString(_enabledKey(userId));
    final theme = prefs.getString(_themeKey(userId));
    if (enabled == null && theme == null) return null;
    return SorbetPreferences(
      enabled: parseSorbetEnabled(enabled),
      theme: SorbetTheme.parse(theme),
    );
  }

  Future<void> writeCache(String? userId, SorbetPreferences value) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      _enabledKey(userId),
      value.enabled ? 'true' : 'false',
    );
    await prefs.setString(_themeKey(userId), value.theme.serialize());
  }

  Future<Set<SorbetField>> pendingFields(String userId) async {
    final prefs = await SharedPreferences.getInstance();
    final names = prefs.getStringList(_pendingKey(userId)) ?? const [];
    return {
      for (final field in SorbetField.values)
        if (names.contains(field.name)) field,
    };
  }

  Future<void> setPending(
    String userId,
    SorbetField field, {
    required bool pending,
  }) async {
    final fields = await pendingFields(userId);
    if (pending) {
      fields.add(field);
    } else {
      fields.remove(field);
    }
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(_pendingKey(userId), [
      for (final field in fields) field.name,
    ]);
  }
}
