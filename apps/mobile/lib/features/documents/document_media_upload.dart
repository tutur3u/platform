import 'dart:typed_data';

import 'package:http/http.dart' as http;
import 'package:mime/mime.dart';
import 'package:mobile/core/cache/drive_upload_delivery.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/documents/document_media.dart';

/// The workspace Drive folder the web documents editor uploads into.
const String documentUploadDirectory = 'documents';

/// Uploads document media through the same workspace storage flow the web
/// documents editor uses: a signed upload URL, the upload, then finalize,
/// all with the signed-in session. The result is the stable sign-on-read
/// share URL the web stores, never a signed URL or token.
class DocumentMediaUploader {
  DocumentMediaUploader({ApiClient? api, http.Client? httpClient})
    : _api = api ?? ApiClient(),
      _http = httpClient ?? http.Client();

  final ApiClient _api;
  final http.Client _http;

  /// Uploads [bytes] picked as [name] to workspace [wsId] and returns the
  /// share URL to store in the document.
  Future<String> upload(
    String wsId, {
    required String name,
    required Uint8List bytes,
    String? contentType,
  }) async {
    final type =
        contentType ?? lookupMimeType(name) ?? 'application/octet-stream';
    final result = await deliverDriveUpload(
      api: _api,
      httpClient: _http,
      workspaceId: wsId,
      filename: documentUploadFileName(name),
      bytes: bytes,
      contentType: type,
      directoryPath: documentUploadDirectory,
    );
    if (result.path.isEmpty) {
      throw const ApiException(
        message: 'Upload returned no path',
        statusCode: 0,
      );
    }
    return documentStorageShareUrl(wsId, result.path);
  }

  void dispose() {
    _api.dispose();
    _http.close();
  }
}
