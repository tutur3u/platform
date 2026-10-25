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
  Future<GetHealthResponse> getHealth() async {
    final uri = origin.resolve('/api/health').replace(queryParameters: {});
    final response = await transport(uri, 'GET');
    if (response.status < 200 || response.status >= 300) throw StateError('API request failed: ' + response.status.toString() + '');
    return GetHealthResponse.fromJson(jsonDecode(response.body) as Map<String, dynamic>);
  }
  Future<GetBuildInfoResponse> getBuildInfo() async {
    final uri = origin.resolve('/api/build-info').replace(queryParameters: {});
    final response = await transport(uri, 'GET');
    if (response.status < 200 || response.status >= 300) throw StateError('API request failed: ' + response.status.toString() + '');
    return GetBuildInfoResponse.fromJson(jsonDecode(response.body) as Map<String, dynamic>);
  }
  Future<GetMobileVersionResponse> getMobileVersion({required String platform, required String build}) async {
    final uri = origin.resolve('/api/v1/mobile/version').replace(queryParameters: {'platform': platform, 'build': build});
    final response = await transport(uri, 'GET');
    if (response.status < 200 || response.status >= 300) throw StateError('API request failed: ' + response.status.toString() + '');
    return GetMobileVersionResponse.fromJson(jsonDecode(response.body) as Map<String, dynamic>);
  }
}
class GetHealthResponse {
  final String status;
  const GetHealthResponse({required this.status});
  factory GetHealthResponse.fromJson(Map<String, dynamic> json) => GetHealthResponse(
    status: json['status'] as String,
  );
}
class GetBuildInfoResponse {
  final String appName;
  final String version;
  final String builtAt;
  final String commitHash;
  final String commitMessage;
  final String? deploymentStamp;
  final String? deploymentUrl;
  final String environment;
  final String refName;
  final String shortCommitHash;
  const GetBuildInfoResponse({required this.appName, required this.version, required this.builtAt, required this.commitHash, required this.commitMessage, required this.deploymentStamp, required this.deploymentUrl, required this.environment, required this.refName, required this.shortCommitHash});
  factory GetBuildInfoResponse.fromJson(Map<String, dynamic> json) => GetBuildInfoResponse(
    appName: json['appName'] as String,
    version: json['version'] as String,
    builtAt: json['builtAt'] as String,
    commitHash: json['commitHash'] as String,
    commitMessage: json['commitMessage'] as String,
    deploymentStamp: json['deploymentStamp'] as String?,
    deploymentUrl: json['deploymentUrl'] as String?,
    environment: json['environment'] as String,
    refName: json['refName'] as String,
    shortCommitHash: json['shortCommitHash'] as String,
  );
}
class GetMobileVersionResponse {
  final String platform;
  final int currentBuild;
  final int minimumSupportedBuild;
  final int latestBuild;
  final String storeUrl;
  final bool requiresUpdate;
  final bool shouldUpdate;
  final String status;
  const GetMobileVersionResponse({required this.platform, required this.currentBuild, required this.minimumSupportedBuild, required this.latestBuild, required this.storeUrl, required this.requiresUpdate, required this.shouldUpdate, required this.status});
  factory GetMobileVersionResponse.fromJson(Map<String, dynamic> json) => GetMobileVersionResponse(
    platform: json['platform'] as String,
    currentBuild: json['currentBuild'] as int,
    minimumSupportedBuild: json['minimumSupportedBuild'] as int,
    latestBuild: json['latestBuild'] as int,
    storeUrl: json['storeUrl'] as String,
    requiresUpdate: json['requiresUpdate'] as bool,
    shouldUpdate: json['shouldUpdate'] as bool,
    status: json['status'] as String,
  );
}
