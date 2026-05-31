import 'dart:convert';

import 'package:equatable/equatable.dart';
import 'package:mobile/features/chat/models/chat_models.dart';

sealed class ChatMessageStreamEvent extends Equatable {
  const ChatMessageStreamEvent();

  @override
  List<Object?> get props => const [];
}

class ChatStreamMessageEvent extends ChatMessageStreamEvent {
  const ChatStreamMessageEvent(this.message);

  final ChatMessage message;

  @override
  List<Object?> get props => [message];
}

class ChatStreamMessagesEvent extends ChatMessageStreamEvent {
  const ChatStreamMessagesEvent(this.messages);

  final List<ChatMessage> messages;

  @override
  List<Object?> get props => [messages];
}

class ChatStreamAssistantDeltaEvent extends ChatMessageStreamEvent {
  const ChatStreamAssistantDeltaEvent(this.delta);

  final String delta;

  @override
  List<Object?> get props => [delta];
}

class ChatStreamAssistantPartEvent extends ChatMessageStreamEvent {
  const ChatStreamAssistantPartEvent(this.part);

  final Map<String, dynamic> part;

  @override
  List<Object?> get props => [part];
}

class ChatStreamDoneEvent extends ChatMessageStreamEvent {
  const ChatStreamDoneEvent();
}

class ChatStreamErrorEvent extends ChatMessageStreamEvent {
  const ChatStreamErrorEvent(this.message);

  final String message;

  @override
  List<Object?> get props => [message];
}

class ChatNdjsonStreamParser {
  String _carry = '';

  List<ChatMessageStreamEvent> addChunk(List<int> chunk) {
    final text = _carry + utf8.decode(chunk, allowMalformed: true);
    final normalized = text.replaceAll('\r\n', '\n');
    final lines = normalized.split('\n');
    _carry = normalized.endsWith('\n') ? '' : lines.removeLast();

    return lines
        .map(_parseLine)
        .whereType<ChatMessageStreamEvent>()
        .toList(growable: false);
  }

  List<ChatMessageStreamEvent> close() {
    if (_carry.trim().isEmpty) return const [];
    final event = _parseLine(_carry);
    _carry = '';
    return event == null ? const [] : [event];
  }

  ChatMessageStreamEvent? _parseLine(String line) {
    final trimmed = line.trim();
    if (trimmed.isEmpty) return null;

    final decoded = jsonDecode(trimmed);
    if (decoded is! Map<String, dynamic>) return null;

    switch (decoded['type']) {
      case 'message':
        final message = decoded['message'];
        if (message is Map<String, dynamic>) {
          return ChatStreamMessageEvent(ChatMessage.fromJson(message));
        }
        return null;
      case 'messages':
        final messages = decoded['messages'];
        if (messages is! List) return const ChatStreamMessagesEvent([]);
        return ChatStreamMessagesEvent(
          messages
              .whereType<Map<String, dynamic>>()
              .map(ChatMessage.fromJson)
              .toList(growable: false),
        );
      case 'assistant_delta':
        return ChatStreamAssistantDeltaEvent(
          decoded['delta']?.toString() ?? '',
        );
      case 'assistant_part':
        final part = decoded['part'];
        if (part is Map<String, dynamic>) {
          return ChatStreamAssistantPartEvent(part);
        }
        return const ChatStreamAssistantPartEvent(<String, dynamic>{});
      case 'done':
        return const ChatStreamDoneEvent();
      case 'error':
        return ChatStreamErrorEvent(
          decoded['message']?.toString() ?? 'Chat stream failed',
        );
      default:
        return null;
    }
  }
}
