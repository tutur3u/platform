import 'dart:async';

import 'package:equatable/equatable.dart';
import 'package:mobile/core/realtime/cloudflare_channel.dart';
import 'package:mobile/data/sources/api_client.dart';

const taskBoardRealtimeChannelPrefix = 'board-realtime';
const taskUserRealtimeChannelPrefix = 'task-user-realtime';

typedef TaskBroadcastHandler = void Function(TaskBroadcastEvent event);

class TaskBroadcastEvent extends Equatable {
  const TaskBroadcastEvent({
    required this.event,
    required this.payload,
    this.task,
    this.list,
  });

  factory TaskBroadcastEvent.fromPayload(
    String event,
    Map<String, dynamic> payload,
  ) {
    final task = payload['task'];
    final list = payload['list'];
    return TaskBroadcastEvent(
      event: event,
      payload: Map<String, dynamic>.unmodifiable(payload),
      task: task is Map<String, dynamic>
          ? Map<String, dynamic>.from(task)
          : null,
      list: list is Map<String, dynamic>
          ? Map<String, dynamic>.from(list)
          : null,
    );
  }

  final String event;
  final Map<String, dynamic> payload;
  final Map<String, dynamic>? task;
  final Map<String, dynamic>? list;

  String? get eventId => payload['__tuturuuuBoardRealtimeEventId'] as String?;
  String? get origin => payload['__tuturuuuBoardRealtimeOrigin'] as String?;
  String? get taskId => payload['taskId'] as String? ?? task?['id'] as String?;
  String? get boardId =>
      payload['boardId'] as String? ??
      payload['source_board_id'] as String? ??
      task?['board_id'] as String? ??
      task?['source_board_id'] as String?;
  String? get listId =>
      payload['listId'] as String? ??
      payload['source_list_id'] as String? ??
      task?['list_id'] as String? ??
      task?['source_list_id'] as String?;
  String? get sourceBoardId => payload['source_board_id'] as String?;
  String? get sourceListId => payload['source_list_id'] as String?;
  String? get personalBoardId => payload['personal_board_id'] as String?;
  String? get personalListId => payload['personal_list_id'] as String?;

  List<String> get taskIds {
    final rawTaskIds = payload['taskIds'];
    if (rawTaskIds is List) {
      return rawTaskIds.whereType<String>().toList(growable: false);
    }

    final id = taskId;
    return id == null ? const [] : [id];
  }

  List<String> get affectedListIds {
    final ids = <String>{
      if (listId != null) listId!,
      if (sourceListId != null) sourceListId!,
      if (personalListId != null) personalListId!,
      ..._stringList(payload['listIds']),
      ..._stringList(payload['source_list_ids']),
      ..._stringList(payload['personal_list_ids']),
    };
    return ids.toList(growable: false);
  }

  List<String> get affectedBoardIds {
    final ids = <String>{
      if (boardId != null) boardId!,
      if (sourceBoardId != null) sourceBoardId!,
      if (personalBoardId != null) personalBoardId!,
      ..._stringList(payload['boardIds']),
      ..._stringList(payload['source_board_ids']),
      ..._stringList(payload['personal_board_ids']),
    };
    return ids.toList(growable: false);
  }

  static List<String> _stringList(Object? value) {
    if (value is! List) return const [];
    return value.whereType<String>().toList(growable: false);
  }

  @override
  List<Object?> get props => [event, payload, task, list];
}

class TaskBroadcastSubscription {
  const TaskBroadcastSubscription(this.cancel);

  final Future<void> Function() cancel;
}

abstract class TaskBroadcastClient {
  TaskBroadcastSubscription subscribeToBoard({
    required String boardId,
    required TaskBroadcastHandler onEvent,
  });

  TaskBroadcastSubscription subscribeToUser({
    required String userId,
    required TaskBroadcastHandler onEvent,
  });

  Future<void> sendBroadcastMessage({
    required String channelName,
    required String event,
    required Map<String, dynamic> payload,
  });
}

/// Cubits own factory-created clients. Injected clients stay shared.
TaskBroadcastClient defaultTaskBroadcastClient({
  ApiClient Function()? createApiClient,
}) => TaskBroadcastOwner(null, createApiClient: createApiClient);

Future<void> closeOwnedTaskBroadcastClient(
  TaskBroadcastClient client,
  TaskBroadcastSubscription? subscription,
) async {
  try {
    await subscription?.cancel();
  } finally {
    if (client is TaskBroadcastOwner) client.dispose();
  }
}

/// Tracks ownership per cubit, even when a factory-created client is injected.
class TaskBroadcastOwner implements TaskBroadcastClient {
  TaskBroadcastOwner(
    TaskBroadcastClient? client, {
    ApiClient Function()? createApiClient,
  }) : _owned = client == null,
       _client =
           client ??
           CloudflareTaskBroadcastClient._owned(
             createApiClient?.call() ?? ApiClient(),
           );
  final TaskBroadcastClient _client;
  final bool _owned;
  void dispose() {
    final client = _client;
    if (_owned && client is CloudflareTaskBroadcastClient) client.dispose();
  }

  @override
  TaskBroadcastSubscription subscribeToBoard({
    required String boardId,
    required TaskBroadcastHandler onEvent,
  }) => _client.subscribeToBoard(boardId: boardId, onEvent: onEvent);
  @override
  TaskBroadcastSubscription subscribeToUser({
    required String userId,
    required TaskBroadcastHandler onEvent,
  }) => _client.subscribeToUser(userId: userId, onEvent: onEvent);
  @override
  Future<void> sendBroadcastMessage({
    required String channelName,
    required String event,
    required Map<String, dynamic> payload,
  }) => _client.sendBroadcastMessage(
    channelName: channelName,
    event: event,
    payload: payload,
  );
}

class CloudflareTaskBroadcastClient implements TaskBroadcastClient {
  CloudflareTaskBroadcastClient({ApiClient? apiClient})
    : _api = apiClient ?? ApiClient(),
      _ownsApi = apiClient == null;
  CloudflareTaskBroadcastClient._owned(this._api) : _ownsApi = true;
  final ApiClient _api;
  final bool _ownsApi;
  bool _disposed = false;

  void dispose() {
    if (_disposed) return;
    _disposed = true;
    if (_ownsApi) _api.dispose();
  }

  CloudflareChannel _channel(
    String topic,
    void Function(Map<String, dynamic>) onMessage,
  ) {
    if (_disposed) throw StateError('Task broadcast client is closed');
    return CloudflareChannel(
      resolveTicket: () =>
          _api.postJson('/api/v1/realtime/channels', {'topic': topic}),
      onMessage: onMessage,
    );
  }

  @override
  TaskBroadcastSubscription subscribeToBoard({
    required String boardId,
    required TaskBroadcastHandler onEvent,
  }) {
    return _subscribe(
      channelName: '$taskBoardRealtimeChannelPrefix-$boardId',
      onEvent: onEvent,
    );
  }

  @override
  TaskBroadcastSubscription subscribeToUser({
    required String userId,
    required TaskBroadcastHandler onEvent,
  }) {
    return _subscribe(
      channelName: '$taskUserRealtimeChannelPrefix-$userId',
      onEvent: onEvent,
    );
  }

  @override
  Future<void> sendBroadcastMessage({
    required String channelName,
    required String event,
    required Map<String, dynamic> payload,
  }) async {
    final channel = _channel(channelName, (_) {});
    try {
      await channel.connect(retryOnFailure: false);
      await channel.send({
        'type': 'broadcast',
        'event': event,
        'payload': payload,
      });
    } finally {
      await channel.close();
    }
  }

  TaskBroadcastSubscription _subscribe({
    required String channelName,
    required TaskBroadcastHandler onEvent,
  }) {
    final channel = _channel(channelName, (message) {
      final event = message['event'];
      final payload = message['payload'];
      if (message['type'] == 'broadcast' &&
          event is String &&
          _taskBroadcastEvents.contains(event) &&
          payload is Map<String, dynamic>) {
        _dispatchPayload(event, payload, onEvent);
      }
    });
    unawaited(channel.connect());
    return TaskBroadcastSubscription(channel.close);
  }

  void _dispatchPayload(
    String event,
    Map<String, dynamic> payload,
    TaskBroadcastHandler onEvent,
  ) {
    if (event.endsWith(':batch')) {
      final baseEvent = event.substring(0, event.length - ':batch'.length);
      final payloads = payload['payloads'];
      if (payloads is List) {
        for (final childPayload in payloads) {
          if (childPayload is! Map<Object?, Object?>) {
            continue;
          }
          onEvent(
            TaskBroadcastEvent.fromPayload(
              baseEvent,
              Map<String, dynamic>.from(childPayload),
            ),
          );
        }
        return;
      }
    }

    onEvent(TaskBroadcastEvent.fromPayload(event, payload));
  }
}

const _taskBroadcastEvents = [
  'task:upsert',
  'task:delete',
  'task:relations-changed',
  'task:deps-changed',
  'list:upsert',
  'list:delete',
  'task:upsert:batch',
  'task:delete:batch',
  'task:relations-changed:batch',
  'task:deps-changed:batch',
  'list:upsert:batch',
  'list:delete:batch',
];
