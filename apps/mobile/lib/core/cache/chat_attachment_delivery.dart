import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:http/http.dart' as http;
import 'package:mobile/data/sources/api_client.dart';

/// Resolves a fresh upload URL at replay time; signed URLs and tokens never
/// enter the encrypted outbox.
Future<Map<String, dynamic>> deliverChatAttachment({
  required ApiClient api,
  required http.Client httpClient,
  required String uploadPath,
  required String filename,
  required String contentType,
  required Uint8List bytes,
}) async {
  final prepared = await api.postJson(uploadPath, {
    'filename': filename,
    'contentType': contentType,
    'sizeBytes': bytes.length,
  });
  final signedUrl = prepared['signedUrl'] as String?;
  if (signedUrl == null || signedUrl.isEmpty) {
    throw const ApiException(
      message: 'Failed to prepare upload',
      statusCode: 0,
    );
  }
  final token = prepared['token'] as String?;
  final headers = <String, String>{
    ...((prepared['headers'] as Map<dynamic, dynamic>? ?? const {}).map(
      (key, value) => MapEntry(key.toString(), value.toString()),
    )),
    'Content-Type': contentType,
    if (token != null && token.isNotEmpty) 'Authorization': 'Bearer $token',
  };
  late http.Response result;
  try {
    result = await httpClient.put(
      Uri.parse(signedUrl),
      headers: headers,
      body: bytes,
    );
    if (result.statusCode < 200 || result.statusCode >= 300) {
      result = await httpClient.put(
        Uri.parse(signedUrl),
        headers: {...headers}..remove('Content-Type'),
        body: bytes,
      );
    }
  } on SocketException catch (_) {
    throw const ApiException(message: 'Upload connection lost', statusCode: 0);
  } on http.ClientException catch (_) {
    throw const ApiException(message: 'Upload connection lost', statusCode: 0);
  } on TimeoutException catch (_) {
    throw const ApiException(message: 'Upload timed out', statusCode: 0);
  }
  if (result.statusCode < 200 || result.statusCode >= 300) {
    throw ApiException(
      message: 'Failed to upload attachment',
      statusCode: result.statusCode,
    );
  }
  final attachment = prepared['attachment'];
  if (attachment is! Map<String, dynamic>) {
    throw const ApiException(
      message: 'Missing uploaded attachment',
      statusCode: 0,
    );
  }
  final storagePath =
      attachment['storage_path'] ??
      attachment['storagePath'] ??
      attachment['path'];
  if (storagePath is! String || storagePath.isEmpty) {
    throw const ApiException(
      message: 'Missing attachment storage path',
      statusCode: 0,
    );
  }
  return attachment;
}
