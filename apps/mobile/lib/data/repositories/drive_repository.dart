import 'dart:typed_data';

import 'package:http/http.dart' as http;
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/models/drive/drive_models.dart';
import 'package:mobile/data/sources/api_client.dart';

class DriveRepository {
  DriveRepository({ApiClient? apiClient, http.Client? httpClient})
    : _api = apiClient ?? ApiClient(),
      _http = httpClient ?? http.Client();

  final ApiClient _api;
  final http.Client _http;

  Future<DriveAnalytics> getAnalytics(String wsId) async {
    final response = await _api.getJson(DriveEndpoints.analytics(wsId));
    return DriveAnalytics.fromJson(
      response['data'] as Map<String, dynamic>? ?? const <String, dynamic>{},
    );
  }

  Future<DriveListResult> listDirectory(
    String wsId, {
    String? path,
    String? search,
    int limit = 50,
    int offset = 0,
    String sortBy = 'name',
    String sortOrder = 'asc',
  }) async {
    final response = await _api.getJson(
      DriveEndpoints.list(
        wsId,
        path: path,
        search: search,
        limit: limit,
        offset: offset,
        sortBy: sortBy,
        sortOrder: sortOrder,
      ),
    );
    return DriveListResult.fromJson(response);
  }

  Future<void> createFolder(
    String wsId, {
    required String name,
    String? path,
  }) async {
    await _api.postJson(DriveEndpoints.folders(wsId), {
      'path': path ?? '',
      'name': name,
    });
  }

  Future<void> renameEntry(
    String wsId, {
    required String currentName,
    required String newName,
    required bool isFolder,
    String? path,
  }) async {
    await _api.postJson(DriveEndpoints.rename(wsId), {
      'path': path ?? '',
      'currentName': currentName,
      'newName': newName,
      'isFolder': isFolder,
    });
  }

  Future<void> deleteFile(String wsId, {required String path}) async {
    await _api.deleteJson(DriveEndpoints.object(wsId), body: {'path': path});
  }

  Future<void> deleteFolder(
    String wsId, {
    required String name,
    String? path,
  }) async {
    await _api.deleteJson(
      DriveEndpoints.folders(wsId),
      body: {
        'path': path ?? '',
        'name': name,
      },
    );
  }

  Future<String> createSignedUrl(
    String wsId, {
    required String path,
    int expiresIn = 3600,
  }) async {
    final response = await _api.postJson(DriveEndpoints.share(wsId), {
      'path': path,
      'expiresIn': expiresIn,
    });
    final signedUrl = response['signedUrl'] as String?;
    if (signedUrl == null || signedUrl.isEmpty) {
      throw const ApiException(
        message: 'Missing signed URL',
        statusCode: 0,
      );
    }
    return signedUrl;
  }

  Future<DriveExportLinks> exportLinks(
    String wsId, {
    required String path,
  }) async {
    final response = await _api.postJson(DriveEndpoints.exportLinks(wsId), {
      'path': path,
    });
    return DriveExportLinks.fromJson(response);
  }

  Future<DriveUploadResult> uploadBytes(
    String wsId, {
    required String filename,
    required Uint8List bytes,
    required String contentType,
    String? directoryPath,
  }) async {
    final uploadPayload = await _api.postJson(DriveEndpoints.uploadUrl(wsId), {
      'filename': filename,
      'path': directoryPath ?? '',
      'size': bytes.length,
    });

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

    var uploadResponse = await _http.put(
      Uri.parse(signedUrl),
      headers: headers,
      body: bytes,
    );

    if (uploadResponse.statusCode < 200 || uploadResponse.statusCode >= 300) {
      final fallbackHeaders = <String, String>{...headers}
        ..remove('Content-Type');
      uploadResponse = await _http.put(
        Uri.parse(signedUrl),
        headers: fallbackHeaders,
        body: bytes,
      );
    }

    if (uploadResponse.statusCode < 200 || uploadResponse.statusCode >= 300) {
      throw ApiException(
        message: 'Failed to upload file',
        statusCode: uploadResponse.statusCode,
      );
    }

    final finalize = await _api.postJson(DriveEndpoints.finalizeUpload(wsId), {
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

  void dispose() {
    _api.dispose();
    _http.close();
  }
}
