import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/data/assistant_live_socket.dart';
import 'package:mobile/features/assistant/models/assistant_live_models.dart';
import 'package:web_socket_channel/io.dart';

void main() {
  test(
    'raw socket setup, history, audio and final transcript ordering',
    () async {
      final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
      final connected = Completer<WebSocket>();
      final messages = StreamController<Map<String, dynamic>>();
      final incoming = StreamIterator(messages.stream);
      final requests = server.listen((request) async {
        final socket = await WebSocketTransformer.upgrade(request);
        connected.complete(socket);
        socket.listen((dynamic frame) {
          messages.add(jsonDecode(frame as String) as Map<String, dynamic>);
        });
      });
      final client = AssistantLiveSocketClient(
        connectChannel: (_) =>
            IOWebSocketChannel.connect('ws://127.0.0.1:${server.port}'),
      );
      final events = <AssistantLiveSocketEvent>[];
      final subscription = client.events.listen(events.add);
      addTearDown(() async {
        await client.disconnect();
        await subscription.cancel();
        client.dispose();
        await incoming.cancel();
        await messages.close();
        await requests.cancel();
        await server.close(force: true);
      });
      await client.connect(
        token: 'test-token',
        model: 'gemini-3.8-live',
        seedHistory: const [
          AssistantLiveSeedContent(
            role: 'user',
            parts: [AssistantLiveSeedPart(text: 'Earlier message')],
          ),
        ],
      );
      await incoming.moveNext();
      final setup = incoming.current['setup'] as Map<String, dynamic>;
      expect(setup['model'], 'models/gemini-3.8-live');
      expect(setup['generationConfig'], {
        'responseModalities': ['AUDIO'],
      });
      expect(setup.containsKey('config'), isFalse);
      expect(setup['sessionResumption'], isEmpty);
      final socket = await connected.future;
      socket.add(jsonEncode({'setupComplete': <String, dynamic>{}}));
      await incoming.moveNext();
      expect(
        (incoming.current['clientContent']
            as Map<String, dynamic>)['turnComplete'],
        isFalse,
      );
      client.sendAudioChunk(Uint8List.fromList([0, 1]));
      await incoming.moveNext();
      expect(
        ((incoming.current['realtimeInput'] as Map<String, dynamic>)['audio']
            as Map<String, dynamic>)['mimeType'],
        'audio/pcm;rate=16000',
      );
      client.endAudioStream();
      await incoming.moveNext();
      expect(incoming.current, {
        'realtimeInput': {'audioStreamEnd': true},
      });

      final generation = client.events.firstWhere(
        (event) => event is AssistantLiveSocketTranscriptDelta,
      );
      socket.add(
        jsonEncode({
          'serverContent': {
            'generationComplete': true,
            'outputTranscription': {'text': 'Still speaking'},
          },
        }),
      );
      await generation;
      expect(events.whereType<AssistantLiveSocketTurnCompleted>(), isEmpty);
      final completed = client.events.firstWhere(
        (event) => event is AssistantLiveSocketTurnCompleted,
      );
      socket.add(
        jsonEncode({
          'serverContent': {
            'turnComplete': true,
            'outputTranscription': {'text': 'Final words'},
          },
        }),
      );
      await completed;
      expect(
        events[events.length - 2],
        isA<AssistantLiveSocketTranscriptDelta>(),
      );
      expect(events.last, isA<AssistantLiveSocketTurnCompleted>());
    },
  );
}
