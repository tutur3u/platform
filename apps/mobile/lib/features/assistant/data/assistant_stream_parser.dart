// Assistant feature parity module: the SSE parser mirrors the AI SDK stream
// protocol directly.

import 'dart:convert';

import 'package:equatable/equatable.dart';

sealed class AssistantStreamEvent extends Equatable {
  const AssistantStreamEvent();

  @override
  List<Object?> get props => const [];
}

class AssistantDoneStreamEvent extends AssistantStreamEvent {
  const AssistantDoneStreamEvent();
}

class AssistantJsonStreamEvent extends AssistantStreamEvent {
  const AssistantJsonStreamEvent(this.payload);

  final Map<String, dynamic> payload;

  @override
  List<Object?> get props => [payload];
}

class AssistantSseParser {
  String _carry = '';

  List<AssistantStreamEvent> addChunk(List<int> chunk) {
    final text = _carry + utf8.decode(chunk, allowMalformed: true);
    final normalized = text.replaceAll('\r\n', '\n');
    final segments = normalized.split('\n\n');

    if (!normalized.endsWith('\n\n')) {
      _carry = segments.removeLast();
    } else {
      _carry = '';
    }

    final events = <AssistantStreamEvent>[];
    for (final rawSegment in segments) {
      final event = _parseSegment(rawSegment);
      if (event != null) {
        events.add(event);
      }
    }
    return events;
  }

  List<AssistantStreamEvent> close() {
    if (_carry.trim().isEmpty) {
      return const [];
    }
    final event = _parseSegment(_carry);
    _carry = '';
    return event == null ? const [] : [event];
  }

  AssistantStreamEvent? _parseSegment(String segment) {
    final buffer = StringBuffer();
    for (final rawLine in segment.split('\n')) {
      final line = rawLine.trimRight();
      if (!line.startsWith('data:')) {
        continue;
      }
      final value = line.substring(5).trimLeft();
      buffer.write(value);
    }

    final data = buffer.toString().trim();
    if (data.isEmpty) return null;
    if (data == '[DONE]') return const AssistantDoneStreamEvent();

    final decoded = jsonDecode(data);
    if (decoded is Map<String, dynamic>) {
      return AssistantJsonStreamEvent(decoded);
    }
    return null;
  }
}
