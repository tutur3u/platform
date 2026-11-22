import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/sources/api_client.dart';

const _accountPreferencesEndpoint =
    '${NotificationEndpoints.base}/account-preferences';

class NotificationPushRepository {
  NotificationPushRepository({ApiClient? apiClient, bool ownsApiClient = false})
    : _apiClient = apiClient ?? ApiClient(),
      _ownsApiClient = apiClient == null || ownsApiClient;

  final ApiClient _apiClient;
  final bool _ownsApiClient;

  Future<void> registerDevice({
    required String deviceId,
    required String token,
    required String platform,
    required String appFlavor,
  }) async {
    await _apiClient.postJson(NotificationEndpoints.pushDevices, {
      'deviceId': deviceId,
      'token': token,
      'platform': platform,
      'appFlavor': appFlavor,
    });
  }

  Future<void> unregisterDevice({
    required String deviceId,
    required String appFlavor,
    String? token,
  }) async {
    await _apiClient.deleteJson(
      NotificationEndpoints.pushDevices,
      body: {
        'deviceId': deviceId,
        'appFlavor': appFlavor,
        if (token != null) 'token': token,
      },
    );
  }

  Future<Map<String, bool>> getAccountPreferences() async {
    final response = await _apiClient.getJson(_accountPreferencesEndpoint);
    final rows = response['preferences'];
    if (rows is! List) throw const FormatException('Invalid preferences');
    return {
      for (final row in rows)
        if (row case {
          'event_type': final String key,
          'channel': 'push',
          'scope': 'user',
          'enabled': final bool enabled,
        })
          key: enabled,
    };
  }

  Future<void> setAccountPreference({
    required String eventType,
    required bool enabled,
    required ApiMutationAdmission admission,
  }) async {
    await _apiClient.putJsonOperationAcknowledged(
      _accountPreferencesEndpoint,
      {
        'preferences': [
          {'eventType': eventType, 'channel': 'push', 'enabled': enabled},
        ],
      },
      admission: admission,
      onAcknowledged: (_) async {},
    );
  }

  void dispose() {
    if (_ownsApiClient) {
      _apiClient.dispose();
    }
  }
}
