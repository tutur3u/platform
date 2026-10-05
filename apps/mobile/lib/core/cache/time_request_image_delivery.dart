import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:mobile/data/sources/api_client.dart';

/// Signs request images only when they are delivered. The encrypted outbox
/// stores bytes and filenames, never upload URLs or bearer tokens.
Future<List<String>> deliverTimeRequestImages({
  required ApiClient api,
  required http.Client httpClient,
  required String workspaceId,
  required String requestId,
  required List<Map<String, dynamic>> images,
}) async {
  if (images.isEmpty) return const [];
  final response = await api.postJson(
    '/api/v1/workspaces/$workspaceId/time-tracking/requests/upload-url',
    {
      'requestId': requestId,
      'files': [
        for (final image in images) {'filename': image['filename']},
      ],
    },
  );
  final uploads = response['uploads'];
  if (uploads is! List || uploads.length != images.length) {
    throw const ApiException(
      message: 'Invalid upload URL response',
      statusCode: 0,
    );
  }
  final paths = <String>[];
  for (var index = 0; index < uploads.length; index++) {
    final upload = uploads[index];
    if (upload is! Map<String, dynamic>) {
      throw const ApiException(
        message: 'Invalid upload URL response',
        statusCode: 0,
      );
    }
    final signedUrl = upload['signedUrl'] as String?;
    final token = upload['token'] as String?;
    final storagePath = upload['path'] as String?;
    if (signedUrl == null || token == null || storagePath == null) {
      throw const ApiException(
        message: 'Invalid upload URL response',
        statusCode: 0,
      );
    }
    final image = images[index];
    late http.Response result;
    try {
      result = await httpClient
          .put(
            Uri.parse(signedUrl),
            headers: {
              'Authorization': 'Bearer $token',
              'Content-Type': image['contentType'] as String,
            },
            body: base64Decode(image['bytes'] as String),
          )
          .timeout(const Duration(seconds: 60));
    } on SocketException catch (_) {
      throw const ApiException.transport(
        message: 'Image upload connection lost',
      );
    } on http.ClientException catch (_) {
      throw const ApiException.transport(
        message: 'Image upload connection lost',
      );
    } on TimeoutException catch (_) {
      throw const ApiException.transport(message: 'Image upload timed out');
    }
    if (result.statusCode < 200 || result.statusCode >= 300) {
      throw ApiException(
        message: 'Failed to upload image',
        statusCode: result.statusCode,
      );
    }
    paths.add(storagePath);
  }
  return paths;
}
