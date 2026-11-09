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
  Future<GetWorkspaceRoleOptionsResponse> getWorkspaceRoleOptions({required String page, required String pageSize}) async {
    final uri = origin.resolve('/api/v1/workspaces/{wsId}/roles/options').replace(queryParameters: {'page': page, 'pageSize': pageSize});
    final response = await transport(uri, 'GET');
    if (response.status < 200 || response.status >= 300) throw StateError('API request failed: ' + response.status.toString() + '');
    return GetWorkspaceRoleOptionsResponse.fromJson(jsonDecode(response.body) as Map<String, dynamic>);
  }
  Future<ListWorkspaceRolesResponse> listWorkspaceRoles({required String page, required String pageSize, required String q}) async {
    final uri = origin.resolve('/api/v1/workspaces/{wsId}/roles').replace(queryParameters: {'page': page, 'pageSize': pageSize, 'q': q});
    final response = await transport(uri, 'GET');
    if (response.status < 200 || response.status >= 300) throw StateError('API request failed: ' + response.status.toString() + '');
    return ListWorkspaceRolesResponse.fromJson(jsonDecode(response.body) as Map<String, dynamic>);
  }
  Future<CreateWorkspaceRoleResponse> createWorkspaceRole() async {
    final uri = origin.resolve('/api/v1/workspaces/{wsId}/roles').replace(queryParameters: {});
    final response = await transport(uri, 'POST');
    if (response.status < 200 || response.status >= 300) throw StateError('API request failed: ' + response.status.toString() + '');
    return CreateWorkspaceRoleResponse.fromJson(jsonDecode(response.body) as Map<String, dynamic>);
  }
  Future<GetWorkspaceDefaultRoleResponse> getWorkspaceDefaultRole() async {
    final uri = origin.resolve('/api/v1/workspaces/{wsId}/roles/default').replace(queryParameters: {});
    final response = await transport(uri, 'GET');
    if (response.status < 200 || response.status >= 300) throw StateError('API request failed: ' + response.status.toString() + '');
    return GetWorkspaceDefaultRoleResponse.fromJson(jsonDecode(response.body) as Map<String, dynamic>);
  }
  Future<GetWorkspaceRoleResponse> getWorkspaceRole() async {
    final uri = origin.resolve('/api/v1/workspaces/{wsId}/roles/{roleId}').replace(queryParameters: {});
    final response = await transport(uri, 'GET');
    if (response.status < 200 || response.status >= 300) throw StateError('API request failed: ' + response.status.toString() + '');
    return GetWorkspaceRoleResponse.fromJson(jsonDecode(response.body) as Map<String, dynamic>);
  }
  Future<List<Map<String, dynamic>>> listWorkspaceRoleMembers() async {
    final uri = origin.resolve('/api/v1/workspaces/{wsId}/roles/{roleId}/members').replace(queryParameters: {});
    final response = await transport(uri, 'GET');
    if (response.status < 200 || response.status >= 300) throw StateError('API request failed: ' + response.status.toString() + '');
    return jsonDecode(response.body) as List<Map<String, dynamic>>;
  }
  Future<GetWorkspaceRoleMemberResponse> getWorkspaceRoleMember() async {
    final uri = origin.resolve('/api/v1/workspaces/{wsId}/roles/{roleId}/members/{userId}').replace(queryParameters: {});
    final response = await transport(uri, 'GET');
    if (response.status < 200 || response.status >= 300) throw StateError('API request failed: ' + response.status.toString() + '');
    return GetWorkspaceRoleMemberResponse.fromJson(jsonDecode(response.body) as Map<String, dynamic>);
  }
  Future<List<Map<String, dynamic>>> listWorkspaceRoleWallets() async {
    final uri = origin.resolve('/api/v1/workspaces/{wsId}/roles/{roleId}/wallets').replace(queryParameters: {});
    final response = await transport(uri, 'GET');
    if (response.status < 200 || response.status >= 300) throw StateError('API request failed: ' + response.status.toString() + '');
    return jsonDecode(response.body) as List<Map<String, dynamic>>;
  }
  Future<GetWorkspaceRoleWalletResponse> getWorkspaceRoleWallet() async {
    final uri = origin.resolve('/api/v1/workspaces/{wsId}/roles/{roleId}/wallets/{walletId}').replace(queryParameters: {});
    final response = await transport(uri, 'GET');
    if (response.status < 200 || response.status >= 300) throw StateError('API request failed: ' + response.status.toString() + '');
    return GetWorkspaceRoleWalletResponse.fromJson(jsonDecode(response.body) as Map<String, dynamic>);
  }
  Future<dynamic> listWorkspaceApiKeys({required String page, required String pageSize, required String q}) async {
    final uri = origin.resolve('/api/v1/workspaces/{wsId}/api-keys').replace(queryParameters: {'page': page, 'pageSize': pageSize, 'q': q});
    final response = await transport(uri, 'GET');
    if (response.status < 200 || response.status >= 300) throw StateError('API request failed: ' + response.status.toString() + '');
    return jsonDecode(response.body) as dynamic;
  }
  Future<CreateWorkspaceApiKeyResponse> createWorkspaceApiKey() async {
    final uri = origin.resolve('/api/v1/workspaces/{wsId}/api-keys').replace(queryParameters: {});
    final response = await transport(uri, 'POST');
    if (response.status < 200 || response.status >= 300) throw StateError('API request failed: ' + response.status.toString() + '');
    return CreateWorkspaceApiKeyResponse.fromJson(jsonDecode(response.body) as Map<String, dynamic>);
  }
  Future<List<Map<String, dynamic>>> getWorkspaceApiKeyRoles() async {
    final uri = origin.resolve('/api/v1/workspaces/{wsId}/api-keys/roles').replace(queryParameters: {});
    final response = await transport(uri, 'GET');
    if (response.status < 200 || response.status >= 300) throw StateError('API request failed: ' + response.status.toString() + '');
    return jsonDecode(response.body) as List<Map<String, dynamic>>;
  }
  Future<GetWorkspaceApiKeyResponse> getWorkspaceApiKey() async {
    final uri = origin.resolve('/api/v1/workspaces/{wsId}/api-keys/{keyId}').replace(queryParameters: {});
    final response = await transport(uri, 'GET');
    if (response.status < 200 || response.status >= 300) throw StateError('API request failed: ' + response.status.toString() + '');
    return GetWorkspaceApiKeyResponse.fromJson(jsonDecode(response.body) as Map<String, dynamic>);
  }
  Future<RotateWorkspaceApiKeyResponse> rotateWorkspaceApiKey() async {
    final uri = origin.resolve('/api/v1/workspaces/{wsId}/api-keys/{keyId}/rotate').replace(queryParameters: {});
    final response = await transport(uri, 'POST');
    if (response.status < 200 || response.status >= 300) throw StateError('API request failed: ' + response.status.toString() + '');
    return RotateWorkspaceApiKeyResponse.fromJson(jsonDecode(response.body) as Map<String, dynamic>);
  }
  Future<List<Map<String, dynamic>>> listWorkspaceApiKeyUsageLogs() async {
    final uri = origin.resolve('/api/v1/workspaces/{wsId}/api-keys/{keyId}/usage-logs').replace(queryParameters: {});
    final response = await transport(uri, 'GET');
    if (response.status < 200 || response.status >= 300) throw StateError('API request failed: ' + response.status.toString() + '');
    return jsonDecode(response.body) as List<Map<String, dynamic>>;
  }
  Future<CreateWorkspaceWhiteboardResponse> createWorkspaceWhiteboard() async {
    final uri = origin.resolve('/api/v1/workspaces/{wsId}/whiteboards').replace(queryParameters: {});
    final response = await transport(uri, 'POST');
    if (response.status < 200 || response.status >= 300) throw StateError('API request failed: ' + response.status.toString() + '');
    return CreateWorkspaceWhiteboardResponse.fromJson(jsonDecode(response.body) as Map<String, dynamic>);
  }
  Future<GetWorkspaceWhiteboardResponse> getWorkspaceWhiteboard() async {
    final uri = origin.resolve('/api/v1/workspaces/{wsId}/whiteboards/{boardId}').replace(queryParameters: {});
    final response = await transport(uri, 'GET');
    if (response.status < 200 || response.status >= 300) throw StateError('API request failed: ' + response.status.toString() + '');
    return GetWorkspaceWhiteboardResponse.fromJson(jsonDecode(response.body) as Map<String, dynamic>);
  }
  Future<GetWorkspaceWhiteboardImageUrlResponse> getWorkspaceWhiteboardImageUrl() async {
    final uri = origin.resolve('/api/v1/workspaces/{wsId}/whiteboards/{boardId}/image-url').replace(queryParameters: {});
    final response = await transport(uri, 'POST');
    if (response.status < 200 || response.status >= 300) throw StateError('API request failed: ' + response.status.toString() + '');
    return GetWorkspaceWhiteboardImageUrlResponse.fromJson(jsonDecode(response.body) as Map<String, dynamic>);
  }
  Future<List<Map<String, dynamic>>> listWorkspaceWorkforceUsers() async {
    final uri = origin.resolve('/api/v1/workspaces/{wsId}/workforce/users').replace(queryParameters: {});
    final response = await transport(uri, 'GET');
    if (response.status < 200 || response.status >= 300) throw StateError('API request failed: ' + response.status.toString() + '');
    return jsonDecode(response.body) as List<Map<String, dynamic>>;
  }
  Future<GetWorkspaceWorkforceUserResponse> getWorkspaceWorkforceUser() async {
    final uri = origin.resolve('/api/v1/workspaces/{wsId}/workforce/users/{userId}').replace(queryParameters: {});
    final response = await transport(uri, 'GET');
    if (response.status < 200 || response.status >= 300) throw StateError('API request failed: ' + response.status.toString() + '');
    return GetWorkspaceWorkforceUserResponse.fromJson(jsonDecode(response.body) as Map<String, dynamic>);
  }
  Future<List<Map<String, dynamic>>> listWorkspaceUserProfileLinks() async {
    final uri = origin.resolve('/api/v1/workspaces/{wsId}/user-profile-links').replace(queryParameters: {});
    final response = await transport(uri, 'GET');
    if (response.status < 200 || response.status >= 300) throw StateError('API request failed: ' + response.status.toString() + '');
    return jsonDecode(response.body) as List<Map<String, dynamic>>;
  }
  Future<List<Map<String, dynamic>>> listWorkspaceUserProfileLinkUsers() async {
    final uri = origin.resolve('/api/v1/workspaces/{wsId}/user-profile-links/users').replace(queryParameters: {});
    final response = await transport(uri, 'GET');
    if (response.status < 200 || response.status >= 300) throw StateError('API request failed: ' + response.status.toString() + '');
    return jsonDecode(response.body) as List<Map<String, dynamic>>;
  }
  Future<GetWorkspaceUserProfileLinkResponse> getWorkspaceUserProfileLink() async {
    final uri = origin.resolve('/api/v1/workspaces/{wsId}/user-profile-links/{linkId}').replace(queryParameters: {});
    final response = await transport(uri, 'GET');
    if (response.status < 200 || response.status >= 300) throw StateError('API request failed: ' + response.status.toString() + '');
    return GetWorkspaceUserProfileLinkResponse.fromJson(jsonDecode(response.body) as Map<String, dynamic>);
  }
  Future<List<Map<String, dynamic>>> listWorkspaceProgrammingProblems() async {
    final uri = origin.resolve('/api/v1/workspaces/{wsId}/programming/problems').replace(queryParameters: {});
    final response = await transport(uri, 'GET');
    if (response.status < 200 || response.status >= 300) throw StateError('API request failed: ' + response.status.toString() + '');
    return jsonDecode(response.body) as List<Map<String, dynamic>>;
  }
  Future<GetWorkspaceProgrammingProblemResponse> getWorkspaceProgrammingProblem() async {
    final uri = origin.resolve('/api/v1/workspaces/{wsId}/programming/problems/{problemId}').replace(queryParameters: {});
    final response = await transport(uri, 'GET');
    if (response.status < 200 || response.status >= 300) throw StateError('API request failed: ' + response.status.toString() + '');
    return GetWorkspaceProgrammingProblemResponse.fromJson(jsonDecode(response.body) as Map<String, dynamic>);
  }
  Future<GetWorkspaceDeletedStatusResponse> getWorkspaceDeletedStatus() async {
    final uri = origin.resolve('/api/v1/workspaces/{wsId}/deleted').replace(queryParameters: {});
    final response = await transport(uri, 'GET');
    if (response.status < 200 || response.status >= 300) throw StateError('API request failed: ' + response.status.toString() + '');
    return GetWorkspaceDeletedStatusResponse.fromJson(jsonDecode(response.body) as Map<String, dynamic>);
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
class GetWorkspaceRoleOptionsResponse {
  final num count;
  final List<Map<String, dynamic>> data;
  const GetWorkspaceRoleOptionsResponse({required this.count, required this.data});
  factory GetWorkspaceRoleOptionsResponse.fromJson(Map<String, dynamic> json) => GetWorkspaceRoleOptionsResponse(
    count: json['count'] as num,
    data: json['data'] as List<Map<String, dynamic>>,
  );
}
class ListWorkspaceRolesResponse {
  final num count;
  final List<Map<String, dynamic>> data;
  const ListWorkspaceRolesResponse({required this.count, required this.data});
  factory ListWorkspaceRolesResponse.fromJson(Map<String, dynamic> json) => ListWorkspaceRolesResponse(
    count: json['count'] as num,
    data: json['data'] as List<Map<String, dynamic>>,
  );
}
class CreateWorkspaceRoleResponse {
  final String id;
  final String message;
  const CreateWorkspaceRoleResponse({required this.id, required this.message});
  factory CreateWorkspaceRoleResponse.fromJson(Map<String, dynamic> json) => CreateWorkspaceRoleResponse(
    id: json['id'] as String,
    message: json['message'] as String,
  );
}
class GetWorkspaceDefaultRoleResponse {
  const GetWorkspaceDefaultRoleResponse({});
  factory GetWorkspaceDefaultRoleResponse.fromJson(Map<String, dynamic> json) => GetWorkspaceDefaultRoleResponse(
  );
}
class GetWorkspaceRoleResponse {
  const GetWorkspaceRoleResponse({});
  factory GetWorkspaceRoleResponse.fromJson(Map<String, dynamic> json) => GetWorkspaceRoleResponse(
  );
}
class GetWorkspaceRoleMemberResponse {
  const GetWorkspaceRoleMemberResponse({});
  factory GetWorkspaceRoleMemberResponse.fromJson(Map<String, dynamic> json) => GetWorkspaceRoleMemberResponse(
  );
}
class GetWorkspaceRoleWalletResponse {
  const GetWorkspaceRoleWalletResponse({});
  factory GetWorkspaceRoleWalletResponse.fromJson(Map<String, dynamic> json) => GetWorkspaceRoleWalletResponse(
  );
}
class CreateWorkspaceApiKeyResponse {
  final String message;
  final String key;
  final String prefix;
  const CreateWorkspaceApiKeyResponse({required this.message, required this.key, required this.prefix});
  factory CreateWorkspaceApiKeyResponse.fromJson(Map<String, dynamic> json) => CreateWorkspaceApiKeyResponse(
    message: json['message'] as String,
    key: json['key'] as String,
    prefix: json['prefix'] as String,
  );
}
class GetWorkspaceApiKeyResponse {
  const GetWorkspaceApiKeyResponse({});
  factory GetWorkspaceApiKeyResponse.fromJson(Map<String, dynamic> json) => GetWorkspaceApiKeyResponse(
  );
}
class RotateWorkspaceApiKeyResponse {
  final String message;
  final String key;
  const RotateWorkspaceApiKeyResponse({required this.message, required this.key});
  factory RotateWorkspaceApiKeyResponse.fromJson(Map<String, dynamic> json) => RotateWorkspaceApiKeyResponse(
    message: json['message'] as String,
    key: json['key'] as String,
  );
}
class CreateWorkspaceWhiteboardResponse {
  final Map<String, dynamic> whiteboard;
  const CreateWorkspaceWhiteboardResponse({required this.whiteboard});
  factory CreateWorkspaceWhiteboardResponse.fromJson(Map<String, dynamic> json) => CreateWorkspaceWhiteboardResponse(
    whiteboard: json['whiteboard'] as Map<String, dynamic>,
  );
}
class GetWorkspaceWhiteboardResponse {
  final Map<String, dynamic> whiteboard;
  const GetWorkspaceWhiteboardResponse({required this.whiteboard});
  factory GetWorkspaceWhiteboardResponse.fromJson(Map<String, dynamic> json) => GetWorkspaceWhiteboardResponse(
    whiteboard: json['whiteboard'] as Map<String, dynamic>,
  );
}
class GetWorkspaceWhiteboardImageUrlResponse {
  const GetWorkspaceWhiteboardImageUrlResponse({});
  factory GetWorkspaceWhiteboardImageUrlResponse.fromJson(Map<String, dynamic> json) => GetWorkspaceWhiteboardImageUrlResponse(
  );
}
class GetWorkspaceWorkforceUserResponse {
  const GetWorkspaceWorkforceUserResponse({});
  factory GetWorkspaceWorkforceUserResponse.fromJson(Map<String, dynamic> json) => GetWorkspaceWorkforceUserResponse(
  );
}
class GetWorkspaceUserProfileLinkResponse {
  const GetWorkspaceUserProfileLinkResponse({});
  factory GetWorkspaceUserProfileLinkResponse.fromJson(Map<String, dynamic> json) => GetWorkspaceUserProfileLinkResponse(
  );
}
class GetWorkspaceProgrammingProblemResponse {
  const GetWorkspaceProgrammingProblemResponse({});
  factory GetWorkspaceProgrammingProblemResponse.fromJson(Map<String, dynamic> json) => GetWorkspaceProgrammingProblemResponse(
  );
}
class GetWorkspaceDeletedStatusResponse {
  final bool deleted;
  const GetWorkspaceDeletedStatusResponse({required this.deleted});
  factory GetWorkspaceDeletedStatusResponse.fromJson(Map<String, dynamic> json) => GetWorkspaceDeletedStatusResponse(
    deleted: json['deleted'] as bool,
  );
}
