import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/core/media/profile_media_optimizer.dart';
import 'package:mobile/core/media/profile_upload_failure.dart';
import 'package:mobile/data/sources/api_client.dart';

/// Obtains a fresh signed URL when a staged avatar leaves the outbox.
Future<void> deliverProfileAvatar({
  required ApiClient api,
  required http.Client httpClient,
  required String filename,
  required String contentType,
  required String encodedBytes,
  bool banner = false,
  String? operationId,
}) async {
  final optimized = await optimizeProfileMediaBytes(
    base64Decode(encodedBytes),
    kind: banner ? ProfileMediaKind.banner : ProfileMediaKind.avatar,
  );
  final signed = await api.postJson(
    banner
        ? ProfileEndpoints.bannerUploadUrl
        : ProfileEndpoints.avatarUploadUrl,
    {
      'filename': optimized.filename,
      if (banner && operationId != null) 'operationId': operationId,
    },
  );
  final receivedOperation = signed['operationId'];
  final bannerOperation = receivedOperation is String
      ? receivedOperation
      : null;
  final publicUrl = signed['publicUrl'];
  if (banner &&
      (bannerOperation == null ||
          !RegExp(
            r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
            caseSensitive: false,
          ).hasMatch(bannerOperation) ||
          (operationId != null && operationId != bannerOperation) ||
          publicUrl is! String ||
          publicUrl.trim().isEmpty)) {
    throw const ApiException(
      message: 'Invalid banner upload receipt',
      statusCode: 0,
      failureKind: ApiFailureKind.response,
      code: 'PROFILE_UPLOAD_RECEIPT_INVALID',
    );
  }
  if (banner && signed['committed'] == true) return;
  if (banner && signed['uploaded'] == true) {
    await api.postJson(ProfileEndpoints.banner, {
      'action': 'finalize',
      'operationId': bannerOperation,
    });
    return;
  }
  final uploadUrl = signed['uploadUrl'] ?? signed['signedUrl'];
  if (uploadUrl is! String ||
      uploadUrl.trim().isEmpty ||
      publicUrl is! String ||
      publicUrl.trim().isEmpty) {
    throw const ApiException(
      message: 'Invalid avatar upload URL',
      statusCode: 0,
      failureKind: ApiFailureKind.response,
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
    throw const ApiException.transport(
      message: 'Avatar upload connection lost',
    );
  } on http.ClientException {
    throw const ApiException.transport(
      message: 'Avatar upload connection lost',
    );
  } on TimeoutException {
    throw const ApiException.transport(message: 'Avatar upload timed out');
  }
  if (uploaded.statusCode < 200 || uploaded.statusCode >= 300) {
    throw profileUploadHttpFailure(uploaded);
  }
  if (banner) {
    await api.postJson(ProfileEndpoints.banner, {
      'action': 'finalize',
      'operationId': bannerOperation,
    });
  } else {
    await api.patchJson(ProfileEndpoints.profile, {'avatar_url': publicUrl});
  }
}
