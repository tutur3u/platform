// Generated from openapi.json. Run bun run --cwd apps/api generate.
import 'dart:convert';

typedef ApiTransport = Future<ApiResponse> Function(Uri uri, String method);
class ApiResponse {
  final int status;
  final String body;
  const ApiResponse(this.status, this.body);
}
class ApiClient {
  final Uri origin;
  final ApiTransport transport;
  const ApiClient(this.origin, this.transport);
  Future<Map<String, dynamic>> getHealth() async {
    final uri = origin.resolve('/api/health').replace(queryParameters: {});
    final response = await transport(uri, 'GET');
    if (response.status < 200 || response.status >= 300) throw StateError('API request failed: ' + response.status.toString() + '');
    return jsonDecode(response.body) as Map<String, dynamic>;
  }
  Future<Map<String, dynamic>> getBuildInfo() async {
    final uri = origin.resolve('/api/build-info').replace(queryParameters: {});
    final response = await transport(uri, 'GET');
    if (response.status < 200 || response.status >= 300) throw StateError('API request failed: ' + response.status.toString() + '');
    return jsonDecode(response.body) as Map<String, dynamic>;
  }
  Future<Map<String, dynamic>> getMobileVersion({required String platform, required String build}) async {
    final uri = origin.resolve('/api/v1/mobile/version').replace(queryParameters: {'platform': platform, 'build': build});
    final response = await transport(uri, 'GET');
    if (response.status < 200 || response.status >= 300) throw StateError('API request failed: ' + response.status.toString() + '');
    return jsonDecode(response.body) as Map<String, dynamic>;
  }
}
