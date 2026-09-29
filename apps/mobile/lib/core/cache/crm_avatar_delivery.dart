import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:http/http.dart' as http;
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/core/config/env.dart';
import 'package:mobile/data/sources/api_client.dart';

/// Uses a fresh upload token at delivery time; queued records retain only
/// encrypted bytes and ordinary file metadata.
Future<String> deliverCrmAvatar({
  required ApiClient api,
  required http.Client httpClient,
  required String workspaceId,
  required String fileName,
  required String contentType,
  required Uint8List bytes,
}) async {
  final response = await api.postJson(CrmEndpoints.avatar(workspaceId), {
    'fileName': fileName,
    'contentType': contentType,
  });
  final token = response['token'] as String?;
  final path = response['path'] as String?;
  if (token == null || token.isEmpty || path == null || path.isEmpty) {
    throw const ApiException(
      message: 'Failed to prepare avatar upload',
      statusCode: 0,
    );
  }

  var projectUrl = Env.supabaseUrl.replaceAll(RegExp(r'/$'), '');
  if (projectUrl.contains('localhost')) {
    projectUrl = projectUrl.replaceAll('localhost', '10.0.2.2');
  }
  late http.Response uploadResponse;
  try {
    uploadResponse = await httpClient
        .put(
          Uri.parse('$projectUrl/storage/v1/s3/object/$path?token=$token'),
          headers: {'Content-Type': contentType},
          body: bytes,
        )
        .timeout(const Duration(seconds: 60));
  } on SocketException catch (_) {
    throw const ApiException(message: 'Avatar connection lost', statusCode: 0);
  } on http.ClientException catch (_) {
    throw const ApiException(message: 'Avatar connection lost', statusCode: 0);
  } on TimeoutException catch (_) {
    throw const ApiException(message: 'Avatar timed out', statusCode: 0);
  }
  if (uploadResponse.statusCode < 200 || uploadResponse.statusCode >= 300) {
    throw ApiException(
      message: 'Failed to upload avatar',
      statusCode: uploadResponse.statusCode,
    );
  }

  final signed = await api.getJson(
    '${CrmEndpoints.avatar(workspaceId)}?path=$path',
  );
  final signedUrl = signed['signedUrl'] as String?;
  if (signedUrl == null || signedUrl.isEmpty) {
    throw const ApiException(
      message: 'Failed to generate avatar URL',
      statusCode: 0,
    );
  }
  return signedUrl;
}
