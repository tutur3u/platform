import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:http/http.dart' as http;
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/sources/api_client.dart';

/// Uses a fresh server-issued upload URL at delivery time; queued records
/// retain only encrypted bytes and ordinary file metadata. The upload host is
/// opaque to the app.
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
  final uploadUrl = response['uploadUrl'] ?? response['signedUrl'];
  final path = response['path'] ?? response['filePath'];
  final uploadUri = uploadUrl is String ? Uri.tryParse(uploadUrl.trim()) : null;
  if (uploadUri == null ||
      !{'http', 'https'}.contains(uploadUri.scheme) ||
      uploadUri.host.isEmpty ||
      path is! String ||
      path.isEmpty) {
    throw const ApiException(
      message: 'Failed to prepare avatar upload',
      statusCode: 0,
    );
  }

  late http.Response uploadResponse;
  try {
    uploadResponse = await httpClient
        .put(uploadUri, headers: {'Content-Type': contentType}, body: bytes)
        .timeout(const Duration(seconds: 60));
  } on SocketException catch (_) {
    throw const ApiException.transport(message: 'Avatar connection lost');
  } on http.ClientException catch (_) {
    throw const ApiException.transport(message: 'Avatar connection lost');
  } on TimeoutException catch (_) {
    throw const ApiException.transport(message: 'Avatar timed out');
  }
  if (uploadResponse.statusCode < 200 || uploadResponse.statusCode >= 300) {
    throw ApiException(
      message: 'Failed to upload avatar',
      statusCode: uploadResponse.statusCode,
    );
  }

  final query = Uri.encodeQueryComponent(path);
  final signed = await api.getJson(
    '${CrmEndpoints.avatar(workspaceId)}?path=$query',
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
