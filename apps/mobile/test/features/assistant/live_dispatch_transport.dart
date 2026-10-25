import 'dart:async';
import 'dart:convert';

import 'package:mobile/features/assistant/data/assistant_live_socket.dart';
import 'package:mocktail/mocktail.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

class _Channel extends Mock implements WebSocketChannel {}

class _Sink extends Mock implements WebSocketSink {}

/// Real socket client with a controlled local sink, without a provider ACK.
class LiveDispatchTransport {
  LiveDispatchTransport() {
    when(() => _channel.stream).thenAnswer((_) => frames.stream);
    when(() => _channel.sink).thenReturn(_sink);
    when(() => _channel.closeCode).thenAnswer((_) => closeCode);
    when(_sink.close).thenAnswer((_) async {
      sinkCloses++;
    });
    when(() => _sink.add(any<dynamic>())).thenAnswer((invocation) {
      final frame =
          jsonDecode(invocation.positionalArguments.single as String)
              as Map<String, dynamic>;
      if (frame.containsKey('setup')) {
        onSetup?.call();
        if (autoReady) {
          scheduleMicrotask(() {
            if (!frames.isClosed) frames.add('{"setupComplete":{}}');
          });
        }
      }
      final input = frame['realtimeInput'] as Map<String, dynamic>?;
      if (input?.containsKey('text') ?? false) {
        textAttempts++;
        beforeText?.call();
      }
      admitted.add(frame);
      if (input?.containsKey('text') ?? false) afterText?.call();
      if ((throwAfterTextAdd && (input?.containsKey('text') ?? false)) ||
          (throwAfterVideoAdd && (input?.containsKey('video') ?? false)) ||
          (throwAfterAudioAdd && (input?.containsKey('audio') ?? false))) {
        throw StateError('Synthetic failure after possible local dispatch');
      }
    });
    socket = AssistantLiveSocketClient(connectChannel: (_) => _channel);
  }

  final _channel = _Channel();
  final _sink = _Sink();
  final frames = StreamController<dynamic>.broadcast(sync: true);
  final admitted = <Map<String, dynamic>>[];
  late final AssistantLiveSocketClient socket;
  int? closeCode;
  int textAttempts = 0;
  int sinkCloses = 0;
  bool autoReady = false;
  void Function()? onSetup;
  bool throwAfterTextAdd = false;
  bool throwAfterVideoAdd = false;
  bool throwAfterAudioAdd = false;
  void Function()? beforeText;
  void Function()? afterText;

  int get setups =>
      admitted.where((frame) => frame.containsKey('setup')).length;

  List<String> get texts => admitted
      .map((frame) => frame['realtimeInput'])
      .whereType<Map<String, dynamic>>()
      .map((input) => input['text'])
      .whereType<String>()
      .toList();

  Future<void> open() => socket.connect(
    token: 'synthetic-local-only',
    model: 'synthetic-model',
    seedHistory: const [],
  );

  Future<void> dispose() async {
    await socket.disconnect();
    socket.dispose();
    await frames.close();
  }
}
