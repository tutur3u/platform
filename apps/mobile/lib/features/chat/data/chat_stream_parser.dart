import 'dart:convert';

import 'package:equatable/equatable.dart';
import 'package:mobile/core/validation/uuid.dart';
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
  ChatNdjsonStreamParser({this.strictNativeReceipts = false});

  final bool strictNativeReceipts;

  /// Validate server receipts before the generic model can coerce raw fields.
  ChatMessage decodeMessage(Object? raw) {
    if (raw is! Map<String, dynamic>) {
      throw const FormatException('Invalid native message receipt');
    }
    if (strictNativeReceipts) {
      bool uuid(Object? value) =>
          value is String && value.trim() == value && isUuid(value);
      final timestamp = raw['createdAt'];
      final metadata = raw['metadata'];
      if (!uuid(raw['id']) ||
          !uuid(raw['conversationId']) ||
          !const {'user', 'assistant', 'system'}.contains(raw['kind']) ||
          raw['content'] is! String ||
          timestamp is! String ||
          !RegExp(
            r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$',
          ).hasMatch(timestamp) ||
          DateTime.tryParse(timestamp) == null ||
          metadata is! Map<String, dynamic> ||
          (raw['kind'] == 'user' && !uuid(metadata['clientRequestId']))) {
        throw const FormatException('Invalid native message receipt');
      }
      final wallClock = DateTime.tryParse(
        timestamp.replaceFirst(RegExp(r'(Z|[+-]\d{2}:\d{2})$'), ''),
      );
      if (wallClock == null ||
          wallClock.toIso8601String().substring(0, 19) !=
              timestamp.substring(0, 19)) {
        throw const FormatException('Invalid native message timestamp');
      }
    }
    return ChatMessage.fromJson(raw);
  }

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
          return ChatStreamMessageEvent(decodeMessage(message));
        }
        if (strictNativeReceipts) decodeMessage(message);
        return null;
      case 'messages':
        final messages = decoded['messages'];
        if (messages is! List) {
          if (strictNativeReceipts) {
            throw const FormatException('Invalid native message batch');
          }
          return const ChatStreamMessagesEvent([]);
        }
        if (strictNativeReceipts) {
          return ChatStreamMessagesEvent(
            messages.map(decodeMessage).toList(growable: false),
          );
        }
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
