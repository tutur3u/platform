import 'dart:convert';
import 'dart:typed_data';

import 'package:http/http.dart' as http;
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/cache/drive_upload_delivery.dart';
import 'package:mobile/core/cache/offline_mutation_queue.dart';
import 'package:mobile/core/cache/offline_read_through.dart';
import 'package:mobile/core/cache/offline_repository_write.dart';
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
    final response = await readThroughJson(
      api: _api,
      namespace: 'drive.analytics',
      workspaceId: wsId,
      path: DriveEndpoints.analytics(wsId),
    );
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
    final response = await readThroughJson(
      api: _api,
      namespace: 'drive.directory',
      workspaceId: wsId,
      path: DriveEndpoints.list(
        wsId,
        path: path,
        search: search,
        limit: limit,
        offset: offset,
        sortBy: sortBy,
        sortOrder: sortOrder,
      ),
    );
    final source = (response['data'] as List<dynamic>? ?? const <dynamic>[])
        .whereType<Map<String, dynamic>>()
        .toList(growable: false);
    final rows = <String, Map<String, dynamic>>{
      for (final row in source)
        if (row['name'] is String) row['name'] as String: {...row},
    };
    if (offset == 0 && (search == null || search.isEmpty)) {
      for (final mutation
          in await OfflineMutationQueue.instance.listPending()) {
        if (mutation.feature != 'drive' || mutation.workspaceId != wsId) {
          continue;
        }
        final payload = mutation.payload ?? const <String, dynamic>{};
        if (mutation.method == 'DRIVE_UPLOAD' &&
            (payload['directoryPath'] ?? '') == (path ?? '')) {
          final filename = payload['filename'] as String?;
          if (filename != null) {
            rows[filename] = {
              'id': mutation.entityId,
              'name': filename,
              'metadata': {
                'size': payload['size'],
                'mimetype': payload['contentType'],
              },
            };
          }
        }
        if (mutation.path == DriveEndpoints.folders(wsId)) {
          if (payload['path'] != (path ?? '')) continue;
          final name = payload['name'] as String?;
          if (name == null) continue;
          if (mutation.method == 'POST') rows[name] = {'name': name};
          if (mutation.method == 'DELETE') rows.remove(name);
        } else if (mutation.path == DriveEndpoints.rename(wsId)) {
          if (payload['path'] != (path ?? '')) continue;
          final oldName = payload['currentName'] as String?;
          final newName = payload['newName'] as String?;
          if (oldName == null || newName == null) continue;
          final old = rows.remove(oldName);
          if (old != null) rows[newName] = {...old, 'name': newName};
        } else if (mutation.path == DriveEndpoints.object(wsId) &&
            mutation.method == 'DELETE') {
          final deletedPath = payload['path'] as String?;
          if (deletedPath == null) continue;
          final parent = deletedPath.contains('/')
              ? deletedPath.substring(0, deletedPath.lastIndexOf('/'))
              : '';
          if (parent == (path ?? '')) rows.remove(deletedPath.split('/').last);
        }
      }
    }
    final pagination = Map<String, dynamic>.from(
      response['pagination'] as Map? ?? const <String, dynamic>{},
    );
    return DriveListResult.fromJson({
      ...response,
      'data': rows.values.toList(growable: false),
      'pagination': {
        ...pagination,
        'total':
            (pagination['total'] as int? ?? source.length) +
            rows.length -
            source.length,
      },
    });
  }

  Future<void> createFolder(
    String wsId, {
    required String name,
    String? path,
  }) async {
    final endpoint = DriveEndpoints.folders(wsId);
    final payload = <String, dynamic>{'path': path ?? '', 'name': name};
    await queueOrSendVoid(
      feature: 'drive',
      method: 'POST',
      path: endpoint,
      workspaceId: wsId,
      entityId: [if (path != null && path.isNotEmpty) path, name].join('/'),
      payload: payload,
      send: () async {
        await _api.postJson(endpoint, payload);
      },
    );
    await CacheStore.instance.invalidateTags({
      'module:drive',
    }, workspaceId: wsId);
  }

  Future<void> renameEntry(
    String wsId, {
    required String currentName,
    required String newName,
    required bool isFolder,
    String? path,
  }) async {
    final endpoint = DriveEndpoints.rename(wsId);
    final payload = <String, dynamic>{
      'path': path ?? '',
      'currentName': currentName,
      'newName': newName,
      'isFolder': isFolder,
    };
    await queueOrSendVoid(
      feature: 'drive',
      method: 'POST',
      path: endpoint,
      workspaceId: wsId,
      entityId: [if (path != null && path.isNotEmpty) path, newName].join('/'),
      payload: payload,
      send: () async {
        await _api.postJson(endpoint, payload);
      },
    );
    await CacheStore.instance.invalidateTags({
      'module:drive',
    }, workspaceId: wsId);
  }

  Future<void> deleteFile(String wsId, {required String path}) async {
    final endpoint = DriveEndpoints.object(wsId);
    final payload = {'path': path};
    await queueOrSendVoid(
      feature: 'drive',
      method: 'DELETE',
      path: endpoint,
      workspaceId: wsId,
      entityId: path,
      payload: payload,
      send: () async {
        await _api.deleteJson(endpoint, body: payload);
      },
    );
    await CacheStore.instance.invalidateTags({
      'module:drive',
    }, workspaceId: wsId);
  }

  Future<void> deleteFolder(
    String wsId, {
    required String name,
    String? path,
  }) async {
    final endpoint = DriveEndpoints.folders(wsId);
    final payload = {'path': path ?? '', 'name': name};
    await queueOrSendVoid(
      feature: 'drive',
      method: 'DELETE',
      path: endpoint,
      workspaceId: wsId,
      entityId: [if (path != null && path.isNotEmpty) path, name].join('/'),
      payload: payload,
      send: () async {
        await _api.deleteJson(endpoint, body: payload);
      },
    );
    await CacheStore.instance.invalidateTags({
      'module:drive',
    }, workspaceId: wsId);
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
      throw const ApiException(message: 'Missing signed URL', statusCode: 0);
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
    final fullPath = [
      if (directoryPath != null && directoryPath.isNotEmpty) directoryPath,
      filename,
    ].join('/');
    return await queueOrSendValue<DriveUploadResult>(
      feature: 'drive',
      method: 'DRIVE_UPLOAD',
      path: DriveEndpoints.uploadUrl(wsId),
      workspaceId: wsId,
      entityId: fullPath,
      payload: {
        'filename': filename,
        'directoryPath': directoryPath ?? '',
        'contentType': contentType,
        'bytes': base64Encode(bytes),
        'size': bytes.length,
      },
      pendingValue: (_) =>
          DriveUploadResult(path: fullPath, fullPath: fullPath),
      send: () => deliverDriveUpload(
        api: _api,
        httpClient: _http,
        workspaceId: wsId,
        filename: filename,
        bytes: bytes,
        contentType: contentType,
        directoryPath: directoryPath,
      ),
    );
  }

  void dispose() {
    _api.dispose();
    _http.close();
  }
}
