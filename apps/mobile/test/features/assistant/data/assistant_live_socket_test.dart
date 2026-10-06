import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/data/assistant_live_socket.dart';
import 'package:mobile/features/assistant/models/assistant_live_models.dart';
import 'package:mocktail/mocktail.dart';
import 'package:web_socket_channel/io.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

class _Channel extends Mock implements WebSocketChannel {}

class _Sink extends Mock implements WebSocketSink {}

void main() {
  for (final transition in ['disconnect', 'replacement', 'ABA']) {
    test(
      'queued old provider frames are refused at $transition admission',
      () async {
        final frames = List.generate(
          3,
          (_) => StreamController<dynamic>(sync: true),
        );
        final channels = List.generate(3, (_) => _Channel());
        final sinks = List.generate(3, (_) => _Sink());
        for (var index = 0; index < channels.length; index++) {
          when(
            () => channels[index].stream,
          ).thenAnswer((_) => frames[index].stream);
          when(() => channels[index].sink).thenReturn(sinks[index]);
          when(() => sinks[index].close()).thenAnswer((_) async {});
        }
        var connection = 0;
        final client = AssistantLiveSocketClient(
          connectChannel: (_) => channels[connection++],
        );
        final observed = <AssistantLiveSocketEvent>[];
        final subscription = client.events.listen(observed.add);
        addTearDown(() async {
          await client.disconnect();
          await subscription.cancel();
          client.dispose();
          for (var index = connection; index < frames.length; index++) {
            // An unused single-subscription stream cannot complete close until
            // it has a listener. Used streams were cancelled by disconnect.
            frames[index].stream.listen((_) {});
          }
          for (final frame in frames) {
            await frame.close();
          }
        });
        await client.connect(
          token: 'synthetic-one',
          model: 'model',
          seedHistory: const [],
        );
        Map<String, dynamic> message(String text) => {
          'serverContent': {
            'outputTranscription': {'text': text},
          },
        };
        // Raw frame handling is synchronous; public delivery stays queued
        // when replacement admission closes the previous lease.
        frames[0].add(jsonEncode(message('Old queued frame')));
        if (transition == 'disconnect') {
          await client.disconnect();
        } else {
          await client.connect(
            token: 'synthetic-two',
            model: 'model',
            seedHistory: const [],
          );
          expect(frames[0].hasListener, isFalse);
          if (transition == 'ABA') {
            frames[1].add(jsonEncode(message('Middle queued frame')));
            await client.connect(
              token: 'synthetic-one',
              model: 'model',
              seedHistory: const [],
            );
            expect(frames[1].hasListener, isFalse);
          }
        }
        await Future<void>.delayed(Duration.zero);
        expect(
          observed.whereType<AssistantLiveSocketTranscriptDelta>(),
          isEmpty,
        );
        verify(() => sinks[0].close()).called(1);
        if (transition != 'disconnect') {
          final current = transition == 'ABA' ? 2 : 1;
          frames[current].add(jsonEncode(message('Current admitted frame')));
          await Future<void>.delayed(Duration.zero);
          expect(
            observed.whereType<AssistantLiveSocketTranscriptDelta>().map(
              (event) => event.text,
            ),
            ['Current admitted frame'],
          );
        }
      },
    );
  }

  test('held old close cannot resurrect or close a newer connection', () async {
    final oldFrames = StreamController<dynamic>(sync: true);
    final currentFrames = StreamController<dynamic>(sync: true);
    final oldChannel = _Channel();
    final currentChannel = _Channel();
    final oldSink = _Sink();
    final currentSink = _Sink();
    final closing = Completer<void>();
    when(() => oldChannel.stream).thenAnswer((_) => oldFrames.stream);
    when(() => currentChannel.stream).thenAnswer((_) => currentFrames.stream);
    when(() => oldChannel.sink).thenReturn(oldSink);
    when(() => currentChannel.sink).thenReturn(currentSink);
    when(oldSink.close).thenAnswer((_) => closing.future);
    when(currentSink.close).thenAnswer((_) async {});
    var connections = 0;
    final client = AssistantLiveSocketClient(
      connectChannel: (_) => connections++ == 0 ? oldChannel : currentChannel,
    );
    final observed = <AssistantLiveSocketEvent>[];
    final subscription = client.events.listen(observed.add);
    addTearDown(() async {
      if (!closing.isCompleted) closing.complete();
      await client.disconnect();
      await subscription.cancel();
      client.dispose();
      await oldFrames.close();
      await currentFrames.close();
    });
    Future<void> connect(String token) =>
        client.connect(token: token, model: 'model', seedHistory: const []);
    await connect('synthetic-original');
    final superseded = connect('synthetic-superseded');
    await Future<void>.delayed(Duration.zero);
    await connect('synthetic-current');
    expect(connections, 2);
    closing.complete();
    await superseded;
    expect(connections, 2);
    expect(oldFrames.hasListener, isFalse);
    expect(currentFrames.hasListener, isTrue);
    verify(oldSink.close).called(1);
    verifyNever(currentSink.close);
    currentFrames.add(
      jsonEncode({
        'serverContent': {
          'outputTranscription': {'text': 'Current connection survives'},
        },
      }),
    );
    await Future<void>.delayed(Duration.zero);
    expect(
      observed.whereType<AssistantLiveSocketTranscriptDelta>().map(
        (event) => event.text,
      ),
      ['Current connection survives'],
    );
  });

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
