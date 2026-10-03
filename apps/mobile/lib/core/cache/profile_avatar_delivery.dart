import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/core/media/profile_media_optimizer.dart';
import 'package:mobile/data/sources/api_client.dart';

/// Obtains a fresh signed URL when a staged avatar leaves the outbox.
Future<void> deliverProfileAvatar({
  required ApiClient api,
  required http.Client httpClient,
  required String filename,
  required String contentType,
  required String encodedBytes,
}) async {
  final optimized = await optimizeProfileMediaBytes(base64Decode(encodedBytes));
  final signed = await api.postJson(ProfileEndpoints.avatarUploadUrl, {
    'filename': optimized.filename,
  });
  final uploadUrl = (signed['uploadUrl'] ?? signed['signedUrl']) as String?;
  final publicUrl = signed['publicUrl'] as String?;
  if (uploadUrl == null || publicUrl == null) {
    throw const ApiException(
      message: 'Invalid avatar upload URL',
      statusCode: 0,
    );
  }
  late http.Response uploaded;
  try {
    uploaded = await httpClient
        .put(
          Uri.parse(uploadUrl),
          headers: {'Content-Type': optimized.contentType},
          body: optimized.bytes,
        )
        .timeout(const Duration(seconds: 60));
  } on SocketException {
    throw const ApiException(
      message: 'Avatar upload connection lost',
      statusCode: 0,
    );
  } on http.ClientException {
    throw const ApiException(
      message: 'Avatar upload connection lost',
      statusCode: 0,
    );
  } on TimeoutException {
    throw const ApiException(message: 'Avatar upload timed out', statusCode: 0);
  }
  if (uploaded.statusCode < 200 || uploaded.statusCode >= 300) {
    throw ApiException(
      message: 'Avatar upload failed',
      statusCode: uploaded.statusCode,
    );
  }
  await api.patchJson(ProfileEndpoints.profile, {'avatar_url': publicUrl});
}
