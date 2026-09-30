import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/repositories/timezone_settings_repository.dart';
import 'package:mobile/data/sources/api_client.dart';

class _Api extends ApiClient {
  String? path;
  Map<String, dynamic>? body;
  final values = <String, String>{};
  @override
  Future<Map<String, dynamic>> getJson(
    String requestPath, {
    bool requiresAuth = true,
  }) async {
    path = requestPath;
    return {'timezone': values[requestPath]};
  }

  @override
  Future<Map<String, dynamic>> patchJson(
    String requestPath,
    Map<String, dynamic> requestBody, {
    bool requiresAuth = true,
  }) async {
    path = requestPath;
    body = requestBody;
    values[requestPath] = requestBody['timezone'] as String;
    return {'timezone': values[requestPath]};
  }
}

void main() {
  test(
    'saves only timezone and reloads the authenticated user endpoint',
    () async {
      final api = _Api();
      final repository = TimezoneSettingsRepository(apiClient: api);
      expect(await repository.loadPersonal(), 'auto');
      expect(
        await repository.savePersonal('Asia/Ho_Chi_Minh'),
        'Asia/Ho_Chi_Minh',
      );
      expect(api.path, '/api/v1/users/calendar-settings');
      expect(api.body, {'timezone': 'Asia/Ho_Chi_Minh'});
      expect(await repository.loadPersonal(), 'Asia/Ho_Chi_Minh');
      repository.dispose();
      api.dispose();
    },
  );
  test('encodes workspace identifier and retains automatic setting', () async {
    final api = _Api();
    final repository = TimezoneSettingsRepository(apiClient: api);
    await repository.saveWorkspace('workspace/a', 'auto');
    expect(api.path, '/api/v1/workspaces/workspace%2Fa/calendar-settings');
    expect(api.body, {'timezone': 'auto'});
    expect(await repository.loadWorkspace('workspace/a'), 'auto');
    repository.dispose();
    api.dispose();
  });
}
