import 'package:mobile/data/sources/api_client.dart';

/// The signed-in account's appearance, shared by every device it signs in on.
///
/// Stored per user in `user_configs` through the existing
/// `/api/v1/users/me/configs` route as an encoded `AppearanceSettings`
/// payload. Light/dark mode is not included; it stays a device choice.
/// Requests are pinned to the given user, so an account switch mid-request
/// fails instead of reading or writing the other account.
class AccountAppearanceRepository {
  AccountAppearanceRepository({ApiClient? apiClient})
    : _api = apiClient ?? ApiClient();

  static const configId = 'MOBILE_APPEARANCE';
  static const _path = '/api/v1/users/me/configs/$configId';

  final ApiClient _api;

  /// The stored payload, or `null` when the account has none yet.
  Future<String?> load(String userId) async {
    final data = await ApiClient.runForUser(userId, () => _api.getJson(_path));
    final value = data['value'];
    return value is String && value.trim().isNotEmpty ? value : null;
  }

  Future<void> save(String userId, String encoded) => ApiClient.runForUser(
    userId,
    () => _api.putJson(_path, {'value': encoded}),
  );
}
