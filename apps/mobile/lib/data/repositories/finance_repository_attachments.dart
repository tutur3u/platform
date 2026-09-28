part of 'finance_repository.dart';

mixin FinanceRepositoryAttachments {
  ApiClient get _api;

  Future<void> uploadTransactionAttachment({
    required String wsId,
    required String transactionId,
    required String filename,
    required Uint8List bytes,
    String? contentType,
  }) async {
    final resolvedContentType =
        contentType ??
        lookupMimeType(filename, headerBytes: bytes.take(12).toList()) ??
        'application/octet-stream';
    final uploadPayload = await _api.postJson(DriveEndpoints.uploadUrl(wsId), {
      'filename': filename,
      'path': 'finance/transactions/$transactionId',
      'size': bytes.length,
    });

    final signedUrl = uploadPayload['signedUrl'] as String?;
    final token = uploadPayload['token'] as String?;
    final path = uploadPayload['path'] as String?;

    if (signedUrl == null || signedUrl.isEmpty || path == null) {
      throw const ApiException(
        message: 'Failed to generate upload URL',
        statusCode: 0,
      );
    }

    final headers = <String, String>{
      ...((uploadPayload['headers'] as Map<dynamic, dynamic>? ??
              const <dynamic, dynamic>{})
          .map((key, value) => MapEntry(key.toString(), value.toString()))),
      'Content-Type': resolvedContentType,
      if (token != null && token.isNotEmpty) 'Authorization': 'Bearer $token',
    };

    var uploadResponse = await http
        .put(Uri.parse(signedUrl), headers: headers, body: bytes)
        .timeout(const Duration(seconds: 60));

    if (uploadResponse.statusCode < 200 || uploadResponse.statusCode >= 300) {
      final fallbackHeaders = <String, String>{...headers}
        ..remove('Content-Type');
      uploadResponse = await http
          .put(Uri.parse(signedUrl), headers: fallbackHeaders, body: bytes)
          .timeout(const Duration(seconds: 60));
    }

    if (uploadResponse.statusCode < 200 || uploadResponse.statusCode >= 300) {
      throw ApiException(
        message: 'Failed to upload file',
        statusCode: uploadResponse.statusCode,
      );
    }

    await _api.postJson(DriveEndpoints.finalizeUpload(wsId), {
      'path': path,
      'contentType': resolvedContentType,
      'originalFilename': filename,
    });
  }
}
