import '../generated/client.dart';

Future<void> main() async {
  var calls = 0;
  final client = ApiClient(Uri.parse('https://fixture.invalid'), (uri, method) async {
    calls++;
    if (uri.path != '/api/v1/mobile/version' ||
        uri.queryParameters['platform'] != 'ios' ||
        uri.queryParameters['build'] != '41' ||
        method != 'GET') {
      throw StateError('Unexpected generated client request');
    }
    return const ApiResponse(200,
        '{"platform":"ios","currentBuild":41,"minimumSupportedBuild":42,"latestBuild":50,"storeUrl":"https://apps.apple.com/app/example","requiresUpdate":true,"shouldUpdate":true,"status":"update-required"}');
  });
  final result = await client.getMobileVersion(platform: 'ios', build: '41');
  if (!result.requiresUpdate || result.minimumSupportedBuild != 42 || calls != 1) {
    throw StateError('Generated client did not preserve the update gate');
  }
}
