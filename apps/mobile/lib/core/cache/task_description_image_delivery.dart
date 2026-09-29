import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:http/http.dart' as http;
import 'package:mobile/data/sources/api_client.dart';

/// Requests a new task upload URL when encrypted queued bytes are delivered.
Future<String> deliverTaskDescriptionImage({
  required ApiClient api,
  required http.Client httpClient,
  required String workspaceId,
  required String filename,
  required String contentType,
  required Uint8List bytes,
  String? taskId,
}) async {
  final upload = await api
      .postJson('/api/v1/workspaces/$workspaceId/tasks/upload-url', {
        'filename': filename,
        if (taskId != null && taskId.trim().isNotEmpty) 'taskId': taskId,
      });
  final signedUrl = upload['signedUrl'] as String?;
  final token = upload['token'] as String?;
  final path = upload['path'] as String?;
  if (signedUrl == null || token == null || path == null) {
    throw const ApiException(
      message: 'Invalid task upload URL response',
      statusCode: 0,
    );
  }

  late http.Response response;
  try {
    response = await httpClient
        .put(
          Uri.parse(signedUrl),
          headers: {
            'Authorization': 'Bearer $token',
            'Content-Type': contentType,
          },
          body: bytes,
        )
        .timeout(const Duration(seconds: 60));
  } on SocketException catch (_) {
    throw const ApiException(
      message: 'Task upload connection lost',
      statusCode: 0,
    );
  } on http.ClientException catch (_) {
    throw const ApiException(
      message: 'Task upload connection lost',
      statusCode: 0,
    );
  } on TimeoutException catch (_) {
    throw const ApiException(message: 'Task upload timed out', statusCode: 0);
  }
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw ApiException(
      message: 'Failed to upload image (${response.statusCode})',
      statusCode: response.statusCode,
    );
  }

  final encodedWsId = Uri.encodeComponent(workspaceId);
  final query = Uri(queryParameters: {'path': path}).query;
  return '/api/v1/workspaces/$encodedWsId/storage/share?$query';
}
