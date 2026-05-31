import 'dart:async';
import 'dart:convert';

import 'package:equatable/equatable.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/chat/models/chat_models.dart';

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
  const ChatRealtimeMessageEvent({
    required this.type,
    required this.message,
  });

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

class ChatRealtimeClient {
  ChatRealtimeClient({ApiClient? apiClient})
    : _apiClient = apiClient ?? ApiClient();

  final ApiClient _apiClient;
  bool _disposed = false;

  Stream<ChatRealtimeEvent> connect(String wsId) async* {
    var retryDelay = const Duration(seconds: 1);

    while (!_disposed) {
      try {
        final response = await _apiClient.getStream(
          '/api/v1/workspaces/$wsId/chat/realtime',
          accept: 'text/event-stream',
        );
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
    _apiClient.dispose();
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
