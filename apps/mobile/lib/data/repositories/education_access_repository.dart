import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/sources/api_client.dart';

class EducationAccessRepository {
  EducationAccessRepository({ApiClient? apiClient})
    : _api = apiClient ?? ApiClient();

  final ApiClient _api;

  bool _decodeEnabled(Object? json) {
    if (json is! Map<String, dynamic>) {
      throw FormatException(
        'Invalid education access payload: expected object. Response: $json',
      );
    }

    if (!json.containsKey('enabled')) {
      throw FormatException(
        'Invalid education access payload: '
        'missing "enabled" key. Response: $json',
      );
    }

    final enabled = json['enabled'];
    if (enabled is bool) {
      return enabled;
    }

    throw FormatException(
      'Invalid education access payload: '
      '"enabled" must be a bool. Response: $json',
    );
  }

  Future<bool> isEducationEnabled(String wsId) async {
    final response = await _api.getJson(EducationEndpoints.access(wsId));
    return _decodeEnabled(response);
  }
}
