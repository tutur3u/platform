import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:mobile/features/assistant/models/assistant_live_models.dart';
import 'package:web_socket_channel/io.dart';

sealed class AssistantLiveSocketEvent {
  const AssistantLiveSocketEvent();
}

class AssistantLiveSocketConnected extends AssistantLiveSocketEvent {
  const AssistantLiveSocketConnected();
}

class AssistantLiveSocketReady extends AssistantLiveSocketEvent {
  const AssistantLiveSocketReady();
}

class AssistantLiveSocketClosed extends AssistantLiveSocketEvent {
  const AssistantLiveSocketClosed(this.reason);

  final String reason;
}

class AssistantLiveSocketError extends AssistantLiveSocketEvent {
  const AssistantLiveSocketError(this.message);

  final String message;
}

class AssistantLiveSocketTextDelta extends AssistantLiveSocketEvent {
  const AssistantLiveSocketTextDelta(this.text);

  final String text;
}

class AssistantLiveSocketTranscriptDelta extends AssistantLiveSocketEvent {
  const AssistantLiveSocketTranscriptDelta({
    required this.text,
    required this.isUserInput,
  });

  final String text;
  final bool isUserInput;
}

class AssistantLiveSocketAudioChunk extends AssistantLiveSocketEvent {
  const AssistantLiveSocketAudioChunk(this.bytes);

  final Uint8List bytes;
}

class AssistantLiveSocketInterrupted extends AssistantLiveSocketEvent {
  const AssistantLiveSocketInterrupted();
}

class AssistantLiveSocketTurnCompleted extends AssistantLiveSocketEvent {
  const AssistantLiveSocketTurnCompleted();
}

class AssistantLiveSocketGoAway extends AssistantLiveSocketEvent {
  const AssistantLiveSocketGoAway(this.timeLeft);

  final String? timeLeft;
}

class AssistantLiveSocketSessionHandleUpdated extends AssistantLiveSocketEvent {
  const AssistantLiveSocketSessionHandleUpdated({
    required this.resumable,
    this.newHandle,
  });

  final bool resumable;
  final String? newHandle;
}

class AssistantLiveSocketToolCall extends AssistantLiveSocketEvent {
  const AssistantLiveSocketToolCall(this.calls);

  final List<AssistantLiveFunctionCall> calls;
}

class AssistantLiveSocketClient {
  final StreamController<AssistantLiveSocketEvent> _events =
      StreamController<AssistantLiveSocketEvent>.broadcast();

  Stream<AssistantLiveSocketEvent> get events => _events.stream;

  IOWebSocketChannel? _channel;
  StreamSubscription<dynamic>? _subscription;
  bool _seedHistoryPending = false;
  List<AssistantLiveSeedContent> _pendingSeedHistory = const [];

  Future<void> connect({
    required String token,
    required String model,
    required List<AssistantLiveSeedContent> seedHistory,
    String? sessionHandle,
  }) async {
    await disconnect();

    final uri = Uri.parse(
      'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=$token',
    );

    _seedHistoryPending = sessionHandle == null && seedHistory.isNotEmpty;
    _pendingSeedHistory = seedHistory;

    _channel = IOWebSocketChannel.connect(
      uri,
      pingInterval: const Duration(seconds: 10),
    );

    _subscription = _channel!.stream.listen(
      _handleMessage,
      onDone: () {
        _events.add(const AssistantLiveSocketClosed('socket closed'));
      },
      onError: (Object error, StackTrace stackTrace) {
        _events.add(AssistantLiveSocketError(error.toString()));
      },
      cancelOnError: false,
    );

    _send(<String, dynamic>{
      'setup': {
        'model': model,
        'config': {
          'responseModalities': ['TEXT', 'AUDIO'],
          'historyConfig': {
            'initialHistoryInClientContent': true,
          },
          'sessionResumption': sessionHandle == null
              ? <String, dynamic>{}
              : {'handle': sessionHandle},
        },
      },
    });
  }

  void sendText(String text) {
    if (text.trim().isEmpty) return;
    _send({
      'realtimeInput': {
        'text': text,
      },
    });
  }

  void sendAudioChunk(Uint8List bytes) {
    if (bytes.isEmpty) return;
    _send({
      'realtimeInput': {
        'audio': {
          'data': base64Encode(bytes),
          'mimeType': 'audio/pcm;rate=16000',
        },
      },
    });
  }

  void sendVideoFrame(Uint8List jpegBytes) {
    if (jpegBytes.isEmpty) return;
    _send({
      'realtimeInput': {
        'video': {
          'data': base64Encode(jpegBytes),
          'mimeType': 'image/jpeg',
        },
      },
    });
  }

  void sendToolResponses(List<Map<String, dynamic>> functionResponses) {
    _send({
      'toolResponse': {
        'functionResponses': functionResponses,
      },
    });
  }

  Future<void> disconnect() async {
    await _subscription?.cancel();
    _subscription = null;
    await _channel?.sink.close();
    _channel = null;
    _seedHistoryPending = false;
    _pendingSeedHistory = const [];
  }

  void dispose() {
    unawaited(disconnect());
    unawaited(_events.close());
  }

  void _handleMessage(dynamic raw) {
    final data = _decodePayload(raw);
    if (data is! Map<String, dynamic>) return;

    if (data['setupComplete'] is Map<String, dynamic>) {
      _events.add(const AssistantLiveSocketConnected());
      if (_seedHistoryPending) {
        _send({
          'clientContent': {
            'turns': _pendingSeedHistory.map((item) => item.toJson()).toList(),
            'turnComplete': true,
          },
        });
        _seedHistoryPending = false;
        _pendingSeedHistory = const [];
      }
      _events.add(const AssistantLiveSocketReady());
      return;
    }

    final goAway = data['goAway'];
    if (goAway is Map<String, dynamic>) {
      _events.add(AssistantLiveSocketGoAway(goAway['timeLeft'] as String?));
      return;
    }

    final resumption = data['sessionResumptionUpdate'];
    if (resumption is Map<String, dynamic>) {
      _events.add(
        AssistantLiveSocketSessionHandleUpdated(
          resumable: resumption['resumable'] as bool? ?? false,
          newHandle: resumption['newHandle'] as String?,
        ),
      );
      return;
    }

    final toolCall = data['toolCall'];
    if (toolCall is Map<String, dynamic>) {
      final calls = (toolCall['functionCalls'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(
            (call) => AssistantLiveFunctionCall(
              id: call['id'] as String? ?? '',
              name: call['name'] as String? ?? '',
              args: (call['args'] as Map<String, dynamic>?) ?? const {},
            ),
          )
          .toList();
      _events.add(AssistantLiveSocketToolCall(calls));
      return;
    }

    final serverContent = data['serverContent'];
    if (serverContent is! Map<String, dynamic>) return;

    if (serverContent['interrupted'] == true) {
      _events.add(const AssistantLiveSocketInterrupted());
    }

    if (serverContent['turnComplete'] == true ||
        serverContent['generationComplete'] == true) {
      _events.add(const AssistantLiveSocketTurnCompleted());
    }

    final outputTranscription = serverContent['outputTranscription'];
    if (outputTranscription is Map<String, dynamic>) {
      final text = outputTranscription['text'] as String?;
      if (text != null && text.isNotEmpty) {
        _events.add(
          AssistantLiveSocketTranscriptDelta(
            text: text,
            isUserInput: false,
          ),
        );
      }
    }

    final inputTranscription = serverContent['inputTranscription'];
    if (inputTranscription is Map<String, dynamic>) {
      final text = inputTranscription['text'] as String?;
      if (text != null && text.isNotEmpty) {
        _events.add(
          AssistantLiveSocketTranscriptDelta(
            text: text,
            isUserInput: true,
          ),
        );
      }
    }

    final modelTurn = serverContent['modelTurn'];
    if (modelTurn is! Map<String, dynamic>) return;

    final parts = modelTurn['parts'] as List<dynamic>? ?? const [];
    for (final rawPart in parts) {
      if (rawPart is! Map<String, dynamic>) continue;

      final text = rawPart['text'] as String?;
      if (text != null && text.isNotEmpty && rawPart['thought'] != true) {
        _events.add(AssistantLiveSocketTextDelta(text));
      }

      final inlineData = rawPart['inlineData'];
      if (inlineData is! Map<String, dynamic>) continue;
      final base64 = inlineData['data'] as String?;
      if (base64 == null || base64.isEmpty) continue;

      final mimeType = inlineData['mimeType'] as String? ?? 'audio/pcm';
      if (!mimeType.startsWith('audio/')) continue;
      _events.add(AssistantLiveSocketAudioChunk(base64Decode(base64)));
    }
  }

  void _send(Map<String, dynamic> payload) {
    _channel?.sink.add(jsonEncode(payload));
  }

  dynamic _decodePayload(dynamic raw) {
    if (raw is String) {
      return jsonDecode(raw);
    }
    if (raw is List<int>) {
      return jsonDecode(utf8.decode(raw));
    }
    return raw;
  }
}
