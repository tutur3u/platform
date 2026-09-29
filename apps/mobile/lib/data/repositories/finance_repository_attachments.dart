part of 'finance_repository.dart';

mixin FinanceRepositoryAttachments {
  ApiClient get _api;

  Future<bool> uploadTransactionAttachment({
    required String wsId,
    required String transactionId,
    required String filename,
    required Uint8List bytes,
    String? contentType,
  }) {
    final resolvedContentType =
        contentType ??
        lookupMimeType(filename, headerBytes: bytes.take(12).toList()) ??
        'application/octet-stream';
    return queueOrSendValue<bool>(
      feature: 'finance',
      method: 'FINANCE_ATTACHMENT_UPLOAD',
      path: DriveEndpoints.uploadUrl(wsId),
      workspaceId: wsId,
      entityId: transactionId,
      payload: {
        'transactionId': transactionId,
        'filename': filename,
        'contentType': resolvedContentType,
        'bytes': base64Encode(bytes),
        'size': bytes.length,
      },
      pendingValue: (_) => true,
      send: () async {
        final client = http.Client();
        try {
          await deliverDriveUpload(
            api: _api,
            httpClient: client,
            workspaceId: wsId,
            filename: filename,
            bytes: bytes,
            contentType: resolvedContentType,
            directoryPath: 'finance/transactions/$transactionId',
          );
          return false;
        } finally {
          client.close();
        }
      },
    );
  }
}
