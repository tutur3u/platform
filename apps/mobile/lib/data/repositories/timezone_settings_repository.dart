import 'package:mobile/data/sources/api_client.dart';

/// Calendar preferences use the authenticated calendar satellite API.
class TimezoneSettingsRepository {
  TimezoneSettingsRepository({ApiClient? apiClient})
    : _api = apiClient ?? ApiClient(),
      _ownsApi = apiClient == null;
  final ApiClient _api;
  final bool _ownsApi;
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
  String _parse(Map<String, dynamic> data) =>
      (data['timezone'] as String?)?.trim().isNotEmpty == true
      ? (data['timezone'] as String).trim()
      : 'auto';
  void dispose() {
    if (_ownsApi) _api.dispose();
  }
}
