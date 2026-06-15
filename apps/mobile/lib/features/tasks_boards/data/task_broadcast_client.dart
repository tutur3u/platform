import 'dart:async';

import 'package:equatable/equatable.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

const taskBoardRealtimeChannelPrefix = 'board-realtime';
const taskUserRealtimeChannelPrefix = 'task-user-realtime';
const privateTaskRealtimeChannelConfig = RealtimeChannelConfig(private: true);

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

class SupabaseTaskBroadcastClient implements TaskBroadcastClient {
  SupabaseTaskBroadcastClient({SupabaseClient? supabase})
    : _supabase = supabase;

  final SupabaseClient? _supabase;

  SupabaseClient? get _client {
    final explicitClient = _supabase;
    if (explicitClient != null) {
      return explicitClient;
    }

    try {
      return Supabase.instance.client;
    } on Object {
      return null;
    }
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
    final supabase = _client;
    if (supabase == null) {
      return;
    }

    final channel = supabase.channel(
      channelName,
      opts: privateTaskRealtimeChannelConfig,
    );
    try {
      await channel.sendBroadcastMessage(event: event, payload: payload);
    } finally {
      await supabase.removeChannel(channel);
    }
  }

  TaskBroadcastSubscription _subscribe({
    required String channelName,
    required TaskBroadcastHandler onEvent,
  }) {
    final supabase = _client;
    if (supabase == null) {
      return TaskBroadcastSubscription(() async {});
    }

    final channel = supabase.channel(
      channelName,
      opts: privateTaskRealtimeChannelConfig,
    );

    for (final eventName in _taskBroadcastEvents) {
      channel.onBroadcast(
        event: eventName,
        callback: (payload) {
          _dispatchPayload(eventName, payload, onEvent);
        },
      );
    }

    channel.subscribe();
    return TaskBroadcastSubscription(() => supabase.removeChannel(channel));
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
