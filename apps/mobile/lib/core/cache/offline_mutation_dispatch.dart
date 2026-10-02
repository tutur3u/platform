part of 'offline_mutation_queue.dart';

extension OfflineMutationDispatch on OfflineMutationQueue {
  Future<void> _dispatchHttpMutation(PendingMutationRecord record) async {
    final api =
        _apiFactory?.call(record.userId!) ??
        ApiClient(expectedUserId: record.userId);
    try {
      if (OfflineInventoryMutation.fromRecord(record) != null) {
        await _dispatchInventoryHttp(record, api);
        return;
      }
      final userId = record.userId;
      final workspaceId = record.workspaceId;
      final ids = userId == null || workspaceId == null
          ? const <String, String>{}
          : await _store.localIdMappingsForScope(
              userId: userId,
              workspaceId: workspaceId,
            );
      final resolved = reconcileOfflineIds(record.path, record.payload, ids);
      switch (record.method.toUpperCase()) {
        case 'POST':
          final response = await api.postJson(resolved.path, resolved.payload);
          if (record.feature == 'mail' &&
              record.path.endsWith('/messages') &&
              (response['message'] as Map<String, dynamic>?)?['status'] !=
                  'sent') {
            throw const ApiException(
              message: 'Mail delivery needs review',
              statusCode: 409,
            );
          }
          if (record.feature == 'tasks' &&
              record.path.endsWith('/tasks/bulk') &&
              (response['failCount'] as num? ?? 0) > 0) {
            throw const ApiException(
              message: 'Bulk task edit partially applied; review required',
              statusCode: 409,
            );
          }
          final localId = record.entityId;
          final serverId = createdServerId(response);
          if (userId != null &&
              workspaceId != null &&
              record.feature != 'drive' &&
              localId != null &&
              serverId != null &&
              localId != serverId) {
            await _store.saveLocalIdMapping(
              userId: userId,
              workspaceId: workspaceId,
              feature: record.feature,
              localId: localId,
              serverId: serverId,
            );
          }
        case 'PUT':
          await api.putJson(resolved.path, resolved.payload ?? {});
        case 'PATCH':
          await api.patchJson(resolved.path, resolved.payload ?? {});
        case 'DELETE':
          await api.deleteJson(resolved.path, body: resolved.payload);
        case 'MAIL_READ_ALL':
          String? cursor;
          String? before;
          do {
            final response = await api.postJson(resolved.path, {
              ...?resolved.payload,
              if (cursor != null) 'cursor': cursor,
              if (before != null) 'before': before,
            });
            cursor = response['nextCursor'] as String?;
            before = response['before'] as String?;
          } while (cursor != null);
        case 'MULTIPART_POST':
          final payload = resolved.payload ?? {};
          await api.sendMultipart(
            'POST',
            resolved.path,
            fields: {
              'clientAttachmentId': payload['clientAttachmentId'] as String,
            },
            files: [
              ApiMultipartFile.bytes(
                field: 'file',
                bytes: base64Decode(payload['bytes'] as String),
                filename: payload['filename'] as String,
              ),
            ],
          );
        case 'DRIVE_UPLOAD':
          if (workspaceId == null) {
            throw StateError('Drive upload has no workspace');
          }
          final payload = resolved.payload ?? const <String, dynamic>{};
          final httpClient = http.Client();
          try {
            await deliverDriveUpload(
              api: api,
              httpClient: httpClient,
              workspaceId: workspaceId,
              filename: payload['filename'] as String,
              bytes: base64Decode(payload['bytes'] as String),
              contentType: payload['contentType'] as String,
              directoryPath: payload['directoryPath'] as String?,
            );
          } finally {
            httpClient.close();
          }
        case 'FINANCE_ATTACHMENT_UPLOAD':
          if (workspaceId == null) {
            throw StateError('Finance attachment has no workspace');
          }
          final payload = resolved.payload ?? const <String, dynamic>{};
          final httpClient = http.Client();
          try {
            await deliverDriveUpload(
              api: api,
              httpClient: httpClient,
              workspaceId: workspaceId,
              filename: payload['filename'] as String,
              bytes: base64Decode(payload['bytes'] as String),
              contentType: payload['contentType'] as String,
              directoryPath: 'finance/transactions/${payload['transactionId']}',
            );
          } finally {
            httpClient.close();
          }
        case 'CRM_BULK_IMPORT':
          final rows = resolved.payload?['rows'] as List<dynamic>? ?? const [];
          await api.postJson(resolved.path, rows);
        case 'CRM_AVATAR_UPLOAD':
          if (workspaceId == null) {
            throw StateError('CRM avatar has no workspace');
          }
          final payload = resolved.payload ?? const <String, dynamic>{};
          final httpClient = http.Client();
          try {
            final signedUrl = await deliverCrmAvatar(
              api: api,
              httpClient: httpClient,
              workspaceId: workspaceId,
              fileName: payload['fileName'] as String,
              contentType: payload['contentType'] as String,
              bytes: base64Decode(payload['bytes'] as String),
            );
            if (userId != null && record.entityId != null) {
              await _store.saveLocalIdMapping(
                userId: userId,
                workspaceId: workspaceId,
                feature: record.feature,
                localId: record.entityId!,
                serverId: signedUrl,
              );
            }
          } finally {
            httpClient.close();
          }
        case 'TASK_DESCRIPTION_IMAGE_UPLOAD':
          if (workspaceId == null) {
            throw StateError('Task image has no workspace');
          }
          final payload = resolved.payload ?? const <String, dynamic>{};
          final httpClient = http.Client();
          try {
            final sharedUrl = await deliverTaskDescriptionImage(
              api: api,
              httpClient: httpClient,
              workspaceId: workspaceId,
              filename: payload['filename'] as String,
              contentType: payload['contentType'] as String,
              bytes: base64Decode(payload['bytes'] as String),
              taskId: payload['taskId'] as String?,
            );
            if (userId != null && record.entityId != null) {
              await _store.saveLocalIdMapping(
                userId: userId,
                workspaceId: workspaceId,
                feature: record.feature,
                localId: record.entityId!,
                serverId: sharedUrl,
              );
            }
          } finally {
            httpClient.close();
          }
        case 'WORKSPACE_SECRET_CREATE':
          if (workspaceId == null) {
            throw StateError('Secret create has no workspace');
          }
          final secretName = resolved.payload?['name'] as String?;
          if (secretName == null || secretName.isEmpty) {
            throw StateError('Secret create has no name');
          }
          await api.postJson(resolved.path, resolved.payload);
          final secrets = await api.getJsonList(
            WorkspaceSettingsEndpoints.secrets(workspaceId),
          );
          final matches = secrets
              .whereType<Map<String, dynamic>>()
              .where(
                (item) => item['name'] == secretName && item['id'] is String,
              )
              .toList(growable: false);
          if (matches.length != 1) {
            throw const ApiException(
              message: 'Secret ID needs review',
              statusCode: 409,
            );
          }
          if (userId != null && record.entityId != null) {
            await _store.saveLocalIdMapping(
              userId: userId,
              workspaceId: workspaceId,
              feature: record.feature,
              localId: record.entityId!,
              serverId: matches.single['id'] as String,
            );
          }
        case 'CHAT_UPLOAD':
          if (workspaceId == null) {
            throw StateError('Chat upload has no workspace');
          }
          final payload = resolved.payload ?? const <String, dynamic>{};
          final httpClient = http.Client();
          try {
            final attachment = await deliverChatAttachment(
              api: api,
              httpClient: httpClient,
              uploadPath: resolved.path,
              filename: payload['filename'] as String,
              contentType: payload['contentType'] as String,
              bytes: base64Decode(payload['bytes'] as String),
            );
            final serverPath =
                attachment['storage_path'] ??
                attachment['storagePath'] ??
                attachment['path'];
            if (userId != null &&
                record.entityId != null &&
                serverPath is String &&
                serverPath.isNotEmpty) {
              await _store.saveLocalIdMapping(
                userId: userId,
                workspaceId: workspaceId,
                feature: 'chat',
                localId: record.entityId!,
                serverId: serverPath,
              );
            }
          } finally {
            httpClient.close();
          }
        case 'TIME_REQUEST_CREATE' || 'TIME_REQUEST_UPDATE':
          if (workspaceId == null) {
            throw StateError('Timer request has no workspace');
          }
          final payload = resolved.payload ?? const <String, dynamic>{};
          final requestId = payload['requestId'] as String;
          final fields = Map<String, dynamic>.from(payload['fields'] as Map);
          final images = (payload['images'] as List<dynamic>? ?? const [])
              .map((image) => Map<String, dynamic>.from(image as Map))
              .toList(growable: false);
          final httpClient = http.Client();
          try {
            final uploaded = await deliverTimeRequestImages(
              api: api,
              httpClient: httpClient,
              workspaceId: workspaceId,
              requestId: requestId,
              images: images,
            );
            final response = record.method == 'TIME_REQUEST_CREATE'
                ? await api.postJson(resolved.path, {
                    ...fields,
                    if (uploaded.isNotEmpty) 'imagePaths': uploaded,
                  })
                : await api.putJson(resolved.path, {
                    ...fields,
                    if (uploaded.isNotEmpty) 'newImagePaths': uploaded,
                  });
            if (record.method == 'TIME_REQUEST_CREATE') {
              final serverId = createdServerId(response);
              if (serverId == null) {
                throw const ApiException(
                  message: 'Missing created timer request ID',
                  statusCode: 0,
                );
              }
              if (userId != null &&
                  record.entityId != null &&
                  serverId != record.entityId) {
                await _store.saveLocalIdMapping(
                  userId: userId,
                  workspaceId: workspaceId,
                  feature: record.feature,
                  localId: record.entityId!,
                  serverId: serverId,
                );
              }
            }
          } finally {
            httpClient.close();
          }
        case 'PROFILE_AVATAR_UPLOAD':
          final payload = resolved.payload ?? const <String, dynamic>{};
          final httpClient = http.Client();
          try {
            await deliverProfileAvatar(
              api: api,
              httpClient: httpClient,
              filename: payload['filename'] as String,
              contentType: payload['contentType'] as String,
              encodedBytes: payload['bytes'] as String,
            );
          } finally {
            httpClient.close();
          }
        case 'WORKSPACE_CREATE':
          final payload = resolved.payload ?? const <String, dynamic>{};
          var serverId = ids[record.entityId];
          if (serverId == null) {
            final created = await api.postJson(WorkspaceEndpoints.team, {
              'name': payload['name'],
            });
            serverId = createdServerId(created);
          }
          if (serverId == null) {
            throw const ApiException(
              message: 'Missing created workspace ID',
              statusCode: 0,
            );
          }
          if (userId != null &&
              workspaceId != null &&
              record.entityId != null) {
            await _store.saveLocalIdMapping(
              userId: userId,
              workspaceId: workspaceId,
              feature: 'workspace',
              localId: record.entityId!,
              serverId: serverId,
            );
          }
          if (payload['avatarBytes'] is String) {
            final httpClient = http.Client();
            try {
              await deliverWorkspaceAvatar(
                api: api,
                httpClient: httpClient,
                workspaceId: serverId,
                filename: payload['avatarFilename'] as String,
                contentType: payload['avatarContentType'] as String,
                encodedBytes: payload['avatarBytes'] as String,
              );
            } finally {
              httpClient.close();
            }
          }
        case 'WORKSPACE_DEFAULT':
          final client = maybeSupabase;
          if (client == null || userId == null) {
            throw StateError('Workspace default requires authentication');
          }
          await client
              .from('user_private_details')
              .update({
                'default_workspace_id': resolved.payload?['workspaceId'],
              })
              .eq('user_id', userId);
        case 'WORKSPACE_AVATAR_UPLOAD':
          if (workspaceId == null) {
            throw StateError('Workspace avatar has no workspace');
          }
          final payload = resolved.payload ?? const <String, dynamic>{};
          final httpClient = http.Client();
          try {
            await deliverWorkspaceAvatar(
              api: api,
              httpClient: httpClient,
              workspaceId: ids[workspaceId] ?? workspaceId,
              filename: payload['filename'] as String,
              contentType: payload['contentType'] as String,
              encodedBytes: payload['bytes'] as String,
            );
          } finally {
            httpClient.close();
          }
        default:
          throw StateError('Unsupported queued method: ${record.method}');
      }
    } finally {
      api.dispose();
    }
  }
}
