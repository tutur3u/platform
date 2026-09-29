import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:http/http.dart' as http;
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/models/drive/drive_models.dart';
import 'package:mobile/data/sources/api_client.dart';

/// Obtains a fresh signed URL at delivery time. Never persists the URL or token
/// in the offline outbox; only encrypted file bytes and ordinary metadata live
/// there until acknowledgement or explicit discard.
Future<DriveUploadResult> deliverDriveUpload({
  required ApiClient api,
  required http.Client httpClient,
  required String workspaceId,
  required String filename,
  required Uint8List bytes,
  required String contentType,
  String? directoryPath,
}) async {
  final uploadPayload = await api.postJson(
    DriveEndpoints.uploadUrl(workspaceId),
    {'filename': filename, 'path': directoryPath ?? '', 'size': bytes.length},
  );
  final signedUrl = uploadPayload['signedUrl'] as String?;
  final token = uploadPayload['token'] as String?;
  final headers = <String, String>{
    ...((uploadPayload['headers'] as Map<dynamic, dynamic>? ??
            const <dynamic, dynamic>{})
        .map((key, value) => MapEntry(key.toString(), value.toString()))),
    if (contentType.isNotEmpty) 'Content-Type': contentType,
    if (token != null && token.isNotEmpty) 'Authorization': 'Bearer $token',
  };
  if (signedUrl == null || signedUrl.isEmpty) {
    throw const ApiException(
      message: 'Failed to generate upload URL',
      statusCode: 0,
    );
  }

  late http.Response response;
  try {
    response = await httpClient.put(
      Uri.parse(signedUrl),
      headers: headers,
      body: bytes,
    );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      response = await httpClient.put(
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
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw ApiException(
      message: 'Failed to upload file',
      statusCode: response.statusCode,
    );
  }

  final finalize = await api
      .postJson(DriveEndpoints.finalizeUpload(workspaceId), {
        'path': uploadPayload['path'],
        'contentType': contentType,
        'originalFilename': filename,
      });
  final autoExtract =
      finalize['autoExtract'] as Map<String, dynamic>? ??
      const <String, dynamic>{};
  return DriveUploadResult(
    path: uploadPayload['path'] as String? ?? '',
    fullPath: uploadPayload['fullPath'] as String?,
    autoExtractStatus: autoExtract['status'] as String?,
    autoExtractMessage: autoExtract['message'] as String?,
  );
}
