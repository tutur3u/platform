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
  final _decoded = StringBuffer();
  late final ByteConversionSink _decoder = utf8.decoder.startChunkedConversion(
    StringConversionSink.fromStringSink(_decoded),
  );
  bool _done = false;

  List<ChatMessageStreamEvent> addChunk(List<int> chunk) {
    if (_done) return const [];
    final events = <ChatMessageStreamEvent>[];
    var start = 0;
    // Decode one NDJSON line at a time so a completed response never decodes
    // trailing bytes. The decoder still retains split UTF-8 code points.
    for (var index = 0; index < chunk.length; index++) {
      if (chunk[index] != 10) continue;
      _decoder.addSlice(chunk, start, index + 1, false);
      events.addAll(_takeDecoded());
      if (_done) return events;
      start = index + 1;
    }
    if (start < chunk.length) {
      _decoder.addSlice(chunk, start, chunk.length, false);
      events.addAll(_takeDecoded());
    }
    return events;
  }

  List<ChatMessageStreamEvent> close() {
    if (_done) return const [];
    _decoder.close();
    return _takeDecoded(finalChunk: true);
  }

  List<ChatMessageStreamEvent> _takeDecoded({bool finalChunk = false}) {
    final normalized = (_carry + _decoded.toString()).replaceAll('\r\n', '\n');
    _decoded.clear();
    final lines = normalized.split('\n');
    _carry = finalChunk || normalized.endsWith('\n') ? '' : lines.removeLast();
    final events = <ChatMessageStreamEvent>[];
    for (final line in lines) {
      final event = _parseLine(line);
      if (event == null) continue;
      events.add(event);
      if (event is ChatStreamDoneEvent) {
        _done = true;
        _carry = '';
        break;
      }
    }
    return events;
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
