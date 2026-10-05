import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/core/media/profile_media_optimizer.dart';
import 'package:mobile/data/sources/api_client.dart';

/// Signs and sends staged workspace avatar bytes only after workspace creation.
Future<void> deliverWorkspaceAvatar({
  required ApiClient api,
  required http.Client httpClient,
  required String workspaceId,
  required String filename,
  required String contentType,
  required String encodedBytes,
}) async {
  final optimized = await optimizeProfileMediaBytes(base64Decode(encodedBytes));
  final signed = await api.postJson(
    WorkspaceEndpoints.avatarUploadUrl(workspaceId),
    {'filename': optimized.filename},
  );
  final url = (signed['uploadUrl'] ?? signed['signedUrl']) as String?;
  final token = signed['token'] as String?;
  final filePath = signed['filePath'] as String?;
  if (url == null || token == null || filePath == null) {
    throw const ApiException(
      message: 'Invalid workspace avatar URL',
      statusCode: 0,
    );
  }
  late http.Response uploaded;
  try {
    uploaded = await httpClient
        .put(
          Uri.parse(url),
          headers: {
            if (!token.startsWith('ttr_app_')) 'Authorization': 'Bearer $token',
            'Content-Type': optimized.contentType,
          },
          body: optimized.bytes,
        )
        .timeout(const Duration(seconds: 60));
  } on SocketException {
    throw const ApiException.transport(
      message: 'Workspace avatar connection lost',
    );
  } on http.ClientException {
    throw const ApiException.transport(
      message: 'Workspace avatar connection lost',
    );
  } on TimeoutException {
    throw const ApiException.transport(message: 'Workspace avatar timed out');
  }
  if (uploaded.statusCode < 200 || uploaded.statusCode >= 300) {
    throw ApiException(
      message: 'Workspace avatar upload failed',
      statusCode: uploaded.statusCode,
    );
  }
  await api.patchJson(WorkspaceEndpoints.avatar(workspaceId), {
    'filePath': filePath,
  });
}
