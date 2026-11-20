import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:equatable/equatable.dart';
import 'package:flutter/widgets.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/chat/models/chat_models.dart';

part 'chat_realtime_socket.dart';

Future<void> _delay(Duration delay) => Future<void>.delayed(delay);

sealed class ChatRealtimeEvent extends Equatable {
  const ChatRealtimeEvent();

  @override
  List<Object?> get props => const [];
}

class ChatRealtimeReadyEvent extends ChatRealtimeEvent {
  const ChatRealtimeReadyEvent();
}

class ChatRealtimeConversationEvent extends ChatRealtimeEvent {
  const ChatRealtimeConversationEvent({
    required this.type,
    required this.conversation,
  });

  final String type;
  final ChatConversation conversation;

  @override
  List<Object?> get props => [type, conversation];
}

class ChatRealtimeConversationDeletedEvent extends ChatRealtimeEvent {
  const ChatRealtimeConversationDeletedEvent(this.conversationId);

  final String conversationId;

  @override
  List<Object?> get props => [conversationId];
}

class ChatRealtimeMessageEvent extends ChatRealtimeEvent {
  const ChatRealtimeMessageEvent({required this.type, required this.message});

  final String type;
  final ChatMessage message;

  @override
  List<Object?> get props => [type, message];
}

class ChatRealtimeTypingEvent extends ChatRealtimeEvent {
  const ChatRealtimeTypingEvent({
    required this.conversationId,
    required this.actorUserId,
    required this.isTyping,
  });

  final String conversationId;
  final String? actorUserId;
  final bool isTyping;

  @override
  List<Object?> get props => [conversationId, actorUserId, isTyping];
}

class ChatRealtimeErrorEvent extends ChatRealtimeEvent {
  const ChatRealtimeErrorEvent(this.message);

  final String message;

  @override
  List<Object?> get props => [message];
}

/// Asks the cubit to refetch. Inbox frames carry ids, and a resync means the
/// room could not replay the gap.
class ChatRealtimeResyncEvent extends ChatRealtimeEvent {
  const ChatRealtimeResyncEvent();
}

typedef ChatRealtimeTicketLoader =
    Future<Map<String, dynamic>> Function(
      String wsId, {
      String? conversationId,
    });

class ChatRealtimeClient {
  ChatRealtimeClient({
    ApiClient? apiClient,
    ChatRealtimeTicketLoader? loadTicket,
    ChatRealtimeSocketOpener? openSocket,
    Future<void> Function(Duration delay)? wait,
    double Function()? random,
    bool watchForeground = true,
  }) : _apiClient = loadTicket == null ? (apiClient ?? ApiClient()) : apiClient,
       _loadTicket = loadTicket,
       _openSocket = openSocket ?? _defaultOpenSocket,
       _wait = wait ?? _delay,
       _random = random ?? Random().nextDouble,
       _watchForeground = watchForeground;

  final ApiClient? _apiClient;
  final ChatRealtimeTicketLoader? _loadTicket;
  final ChatRealtimeSocketOpener _openSocket;
  final Future<void> Function(Duration delay) _wait;
  final double Function() _random;
  final bool _watchForeground;
  final List<_ChatRealtimeRun> _runs = [];
  bool _disposed = false;
  AppLifecycleListener? _lifecycle;
  StreamSubscription<List<ConnectivityResult>>? _connectivity;

  /// Inbox socket, or one conversation room when [conversationId] is set.
  Stream<ChatRealtimeEvent> connect(String wsId, {String? conversationId}) {
    _ensureForegroundWatch();
    final controller = StreamController<ChatRealtimeEvent>();
    final run = _ChatRealtimeRun(
      client: this,
      controller: controller,
      conversationId: conversationId,
      wsId: wsId,
    );
    _runs.add(run);
    controller.onCancel = run.stop;
    unawaited(
      run.start().whenComplete(() {
        _runs.remove(run);
        if (!controller.isClosed) unawaited(controller.close());
      }),
    );
    return controller.stream;
  }

  /// Retries once after polling, when the app or network returns.
  void retry() {
    for (final run in _runs) {
      run.retry();
    }
  }

  void _ensureForegroundWatch() {
    if (!_watchForeground || _lifecycle != null || _disposed) return;
    try {
      WidgetsBinding.instance;
    } on Object {
      return;
    }
    _lifecycle = AppLifecycleListener(
      onResume: () {
        _reportPresence(true);
        retry();
      },
      onPause: () => _reportPresence(false),
      onInactive: () => _reportPresence(false),
      onHide: () => _reportPresence(false),
    );
    _connectivity ??= Connectivity().onConnectivityChanged.listen((results) {
      if (_disposed) return;
      if (results.any((value) => value != ConnectivityResult.none)) {
        retry();
      }
    }, onError: (Object _) {});
  }

  void _reportPresence(bool foreground) {
    for (final run in _runs) {
      run.reportPresence(foreground);
    }
  }

  Future<Map<String, dynamic>> _ticket(String wsId, {String? conversationId}) {
    final loader = _loadTicket;
    if (loader != null) {
      return loader(wsId, conversationId: conversationId);
    }
    final query = conversationId == null
        ? ''
        : '?conversationId=${Uri.encodeQueryComponent(conversationId)}';
    return _apiClient!.getJson(
      '/api/v1/workspaces/$wsId/chat/realtime/ticket$query',
    );
  }

  Stream<ChatRealtimeEvent> _legacy(String wsId) async* {
    var retryDelay = const Duration(seconds: 1);

    while (!_disposed) {
      try {
        final apiClient = _apiClient;
        if (apiClient == null) {
          yield const ChatRealtimeErrorEvent('Realtime disabled');
          return;
        }
        final response = await apiClient.getStream(
          '/api/v1/workspaces/$wsId/chat/realtime',
          accept: 'text/event-stream',
        );
        if (response.statusCode == 204) {
          yield const ChatRealtimeErrorEvent('Realtime disabled');
          return;
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          yield ChatRealtimeErrorEvent(
            'Realtime unavailable (${response.statusCode})',
          );
          await Future<void>.delayed(retryDelay);
          retryDelay = _nextRetryDelay(retryDelay);
          continue;
        }

        retryDelay = const Duration(seconds: 1);
        final parser = _SseParser();
        await for (final chunk in response.stream) {
          if (_disposed) break;
          for (final payload in parser.addChunk(chunk)) {
            final event = _eventFromPayload(payload);
            if (event != null) yield event;
          }
        }
        for (final payload in parser.close()) {
          final event = _eventFromPayload(payload);
          if (event != null) yield event;
        }
        if (!_disposed) {
          yield const ChatRealtimeErrorEvent('Realtime disconnected');
        }
      } on Object catch (error) {
        if (_disposed) break;
        yield ChatRealtimeErrorEvent(error.toString());
      }

      if (!_disposed) {
        await Future<void>.delayed(retryDelay);
        retryDelay = _nextRetryDelay(retryDelay);
      }
    }
  }

  Duration _nextRetryDelay(Duration current) {
    final nextSeconds = (current.inSeconds * 2).clamp(1, 10);
    return Duration(seconds: nextSeconds);
  }

  ChatRealtimeEvent? _eventFromPayload(Map<String, dynamic> payload) {
    switch (payload['type']) {
      case 'ready':
        return const ChatRealtimeReadyEvent();
      case 'conversation.created':
      case 'conversation.updated':
        final conversation = payload['conversation'];
        if (conversation is Map<String, dynamic>) {
          return ChatRealtimeConversationEvent(
            type: payload['type'].toString(),
            conversation: ChatConversation.fromJson(conversation),
          );
        }
        return null;
      case 'conversation.deleted':
        final result = payload['result'];
        final conversationId = result is Map
            ? result['conversationId']?.toString()
            : payload['conversationId']?.toString();
        if (conversationId == null || conversationId.isEmpty) return null;
        return ChatRealtimeConversationDeletedEvent(conversationId);
      case 'message.created':
      case 'message.updated':
      case 'message.deleted':
      case 'reaction.updated':
        final message = payload['message'];
        if (message is Map<String, dynamic>) {
          return ChatRealtimeMessageEvent(
            type: payload['type'].toString(),
            message: ChatMessage.fromJson(message),
          );
        }
        return null;
      case 'typing.updated':
        return ChatRealtimeTypingEvent(
          conversationId: payload['conversationId']?.toString() ?? '',
          actorUserId: payload['actorUserId']?.toString(),
          isTyping: payload['isTyping'] as bool? ?? false,
        );
      case 'error':
        return ChatRealtimeErrorEvent(
          payload['error']?.toString() ?? 'Realtime failed',
        );
      default:
        return null;
    }
  }

  void dispose() {
    _disposed = true;
    _lifecycle?.dispose();
    _lifecycle = null;
    unawaited(_connectivity?.cancel());
    _connectivity = null;
    for (final run in [..._runs]) {
      run.stop();
    }
    _apiClient?.dispose();
  }
}

class _SseParser {
  String _carry = '';

  List<Map<String, dynamic>> addChunk(List<int> chunk) {
    final text = _carry + utf8.decode(chunk, allowMalformed: true);
    final normalized = text.replaceAll('\r\n', '\n');
    final segments = normalized.split('\n\n');
    _carry = normalized.endsWith('\n\n') ? '' : segments.removeLast();

    return segments
        .map(_parseSegment)
        .whereType<Map<String, dynamic>>()
        .toList(growable: false);
  }

  List<Map<String, dynamic>> close() {
    if (_carry.trim().isEmpty) return const [];
    final event = _parseSegment(_carry);
    _carry = '';
    return event == null ? const [] : [event];
  }

  Map<String, dynamic>? _parseSegment(String segment) {
    final data = segment
        .split('\n')
        .where((line) => line.startsWith('data:'))
        .map((line) => line.substring(5).trimLeft())
        .join('\n')
        .trim();
    if (data.isEmpty) return null;
    final decoded = jsonDecode(data);
    return decoded is Map<String, dynamic> ? decoded : null;
  }
}
