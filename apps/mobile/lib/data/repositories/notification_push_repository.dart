import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/sources/api_client.dart';

class NotificationPushRepository {
  NotificationPushRepository({
    ApiClient? apiClient,
    bool ownsApiClient = false,
  }) : _apiClient = apiClient ?? ApiClient(),
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

  void dispose() {
    if (_ownsApiClient) {
      _apiClient.dispose();
    }
  }
}
