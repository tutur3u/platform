part of 'time_tracker_repository.dart';

extension _TimeTrackerRepositoryHelpers on TimeTrackerRepository {
  Future<TimeTrackingSession?> _pendingRunningSession(
    String wsId,
    Object? snapshot,
  ) async {
    var current = snapshot is Map<String, dynamic>
        ? Map<String, dynamic>.from(snapshot)
        : null;
    final base = '/api/v1/workspaces/$wsId/time-tracking/sessions';
    for (final mutation in await OfflineMutationQueue.instance.listPending()) {
      if (mutation.feature != 'time_tracker' ||
          mutation.workspaceId != wsId ||
          !mutation.path.startsWith(base)) {
        continue;
      }
      final payload = mutation.payload ?? const <String, dynamic>{};
      if (mutation.method == 'POST' &&
          mutation.path == base &&
          payload['endTime'] == null &&
          mutation.entityId != null) {
        current = {
          'id': mutation.entityId,
          'ws_id': wsId,
          'title': payload['title'],
          'start_time':
              payload['startTime'] ?? mutation.createdAt.toIso8601String(),
          'is_running': true,
        };
      } else if (current?['id'] == mutation.entityId) {
        if (mutation.method == 'DELETE' ||
            payload['action'] == 'stop' ||
            payload['action'] == 'pause') {
          current = null;
        } else if (payload['action'] == 'resume') {
          current = {...?current, 'is_running': true};
        }
      }
    }
    return current == null ? null : TimeTrackingSession.fromJson(current);
  }

  Future<List<Map<String, dynamic>>> _sessionRows(
    String wsId,
    Map<String, dynamic> data, {
    bool includeCreates = true,
  }) async => overlayPendingCollection(
    workspaceId: wsId,
    feature: 'time_tracker',
    pathContains: '/api/v1/workspaces/$wsId/time-tracking/sessions',
    source: (data['sessions'] as List<dynamic>? ?? const [])
        .whereType<Map<String, dynamic>>()
        .toList(growable: false),
    pending: await OfflineMutationQueue.instance.listPending(),
    includeCreates: includeCreates,
    normalizeCreate: (payload) => {
      'title': payload['title'],
      'description': payload['description'],
      'category_id': payload['categoryId'],
      'task_id': payload['taskId'],
      'start_time':
          payload['startTime'] ?? DateTime.now().toUtc().toIso8601String(),
      'end_time': payload['endTime'],
      'ws_id': wsId,
      'created_at': DateTime.now().toUtc().toIso8601String(),
    },
  );

  Future<TimeTrackingSession> _writeSession(
    String wsId,
    String method,
    String path,
    Map<String, dynamic> payload, {
    String? sessionId,
  }) => queueOrSendValue(
    feature: 'time_tracker',
    method: method,
    path: path,
    workspaceId: wsId,
    entityId: sessionId,
    payload: payload,
    send: () async {
      final data = method == 'POST'
          ? await _api.postJson(path, payload)
          : await _api.patchJson(path, payload);
      return TimeTrackingSession.fromJson(
        data['session'] as Map<String, dynamic>,
      );
    },
    pendingValue: (id) => TimeTrackingSession.fromJson({
      'id': id,
      'ws_id': wsId,
      'title': payload['title'],
      'description': payload['description'],
      'category_id': payload['categoryId'],
      'task_id': payload['taskId'],
      'start_time':
          payload['startTime'] ?? DateTime.now().toUtc().toIso8601String(),
      'end_time':
          payload['endTime'] ??
          (payload['action'] == 'stop'
              ? DateTime.now().toUtc().toIso8601String()
              : null),
      'is_running':
          payload['action'] != 'stop' &&
          payload['action'] != 'pause' &&
          payload['endTime'] == null,
      'created_at': DateTime.now().toUtc().toIso8601String(),
    }),
  );

  Future<Map<String, dynamic>> _read(String wsId, String path) =>
      readThroughJson(
        api: _api,
        namespace: 'time_tracker.data',
        workspaceId: wsId,
        path: path,
      );

  Future<List<dynamic>> _readList(String wsId, String path) =>
      readThroughJsonList(
        api: _api,
        namespace: 'time_tracker.list',
        workspaceId: wsId,
        path: path,
      );

  String _withQuery(String path, Map<String, String?> query) {
    final entries = query.entries.where((entry) {
      final value = entry.value;
      return value != null && value.isNotEmpty;
    }).toList();

    if (entries.isEmpty) {
      return path;
    }

    final encoded = entries
        .map((entry) {
          final key = Uri.encodeQueryComponent(entry.key);
          final value = Uri.encodeQueryComponent(entry.value!);
          return '$key=$value';
        })
        .join('&');
    return '$path?$encoded';
  }

  String _toApiIso(DateTime value) => value.toUtc().toIso8601String();

  String _filenameFromPath(String path) {
    final normalized = path.replaceAll(RegExp(r'\\'), '/');
    final slashIndex = normalized.lastIndexOf('/');
    if (slashIndex == -1 || slashIndex == normalized.length - 1) {
      return normalized;
    }
    return normalized.substring(slashIndex + 1);
  }

  String _generateUuidV4() {
    final bytes = List<int>.generate(
      16,
      (_) => TimeTrackerRepository._uuidRandom.nextInt(256),
    );
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    String hex(int value) => value.toRadixString(16).padLeft(2, '0');

    return '${hex(bytes[0])}${hex(bytes[1])}${hex(bytes[2])}${hex(bytes[3])}-'
        '${hex(bytes[4])}${hex(bytes[5])}-'
        '${hex(bytes[6])}${hex(bytes[7])}-'
        '${hex(bytes[8])}${hex(bytes[9])}-'
        '${hex(bytes[10])}'
        '${hex(bytes[11])}'
        '${hex(bytes[12])}'
        '${hex(bytes[13])}'
        '${hex(bytes[14])}'
        '${hex(bytes[15])}';
  }

  Future<List<Map<String, dynamic>>> _stageRequestImages(
    List<String> localImagePaths,
  ) async {
    final staged = <Map<String, dynamic>>[];
    for (final path in localImagePaths) {
      staged.add({
        'filename': _filenameFromPath(path),
        'contentType': lookupMimeType(path) ?? 'application/octet-stream',
        'bytes': base64Encode(await File(path).readAsBytes()),
      });
    }
    return staged;
  }
}
