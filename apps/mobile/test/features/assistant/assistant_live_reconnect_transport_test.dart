import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_live_audio_player.dart';
import 'package:mobile/features/assistant/data/assistant_live_camera_service.dart';
import 'package:mobile/features/assistant/data/assistant_live_recorder.dart';
import 'package:mobile/features/assistant/data/assistant_live_repository.dart';
import 'package:mobile/features/assistant/data/assistant_live_socket.dart';
import 'package:mobile/features/assistant/models/assistant_live_models.dart';
import 'package:mocktail/mocktail.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

class _Repository extends Mock implements AssistantLiveRepository {}

class _Player extends Mock implements AssistantLiveAudioPlayer {}

class _Recorder extends Mock implements AssistantLiveRecorder {}

class _Camera extends Mock implements AssistantLiveCameraService {}

class _Channel extends Mock implements WebSocketChannel {}

class _Sink extends Mock implements WebSocketSink {}

/// The real socket client over controlled channels. The first channel's close
/// and native recorder Stop are held independently, so a reconnect can sit
/// inside `socket.connect` waiting on the previous close while End Call or
/// close waits on native Stop.
class _Transport {
  _Transport() {
    when(player.initialize).thenAnswer((_) async {});
    when(player.pause).thenAnswer((_) async {});
    when(player.clear).thenAnswer((_) async {});
    when(player.dispose).thenAnswer((_) async {});
    when(recorder.stop).thenAnswer((_) {
      if (!stopEntered.isCompleted) stopEntered.complete();
      return heldStop.future;
    });
    when(recorder.dispose).thenAnswer((_) async {});
    when(camera.stopStreaming).thenAnswer((_) async {});
    when(camera.dispose).thenAnswer((_) async {});
    when(
      () => repository.fetchLiveToken(
        wsId: 'ws',
        chatId: any(named: 'chatId'),
        model: any(named: 'model'),
        forceFresh: any(named: 'forceFresh'),
      ),
    ).thenAnswer(
      (invocation) async => AssistantLiveTokenEnvelope(
        token: 'synthetic',
        chatId: 'chat',
        scopeKey: 'scope',
        sessionHandle: null,
        model: invocation.namedArguments[#model] as String? ?? 'model',
        seedHistory: const [],
      ),
    );
    socket = AssistantLiveSocketClient(connectChannel: _open);
    cubit = AssistantLiveCubit(
      repository: repository,
      socket: socket,
      audioPlayer: player,
      recorder: recorder,
      cameraService: camera,
      currentUserId: () => null,
      onChatBound: (_, _) async {},
      onHistoryUpdated: (_, _) async {},
    );
  }

  final repository = _Repository();
  final player = _Player();
  final recorder = _Recorder();
  final camera = _Camera();
  final frames = <StreamController<dynamic>>[];
  final openedSteps = <int>[];
  final previousClose = Completer<void>();
  final previousClosing = Completer<void>();
  final heldStop = Completer<void>();
  final stopEntered = Completer<void>();
  late final AssistantLiveSocketClient socket;
  late final AssistantLiveCubit cubit;
  int step = 0;

  WebSocketChannel _open(Uri _) {
    final index = frames.length;
    final frame = StreamController<dynamic>(sync: true);
    frames.add(frame);
    openedSteps.add(step);
    final channel = _Channel();
    final sink = _Sink();
    when(() => channel.stream).thenAnswer((_) => frame.stream);
    when(() => channel.sink).thenReturn(sink);
    when(sink.close).thenAnswer((_) {
      if (index != 0) return Future<void>.value();
      if (!previousClosing.isCompleted) previousClosing.complete();
      return previousClose.future;
    });
    scheduleMicrotask(() {
      if (!frame.isClosed) {
        frame.add(jsonEncode({'setupComplete': <String, dynamic>{}}));
      }
    });
    return channel;
  }

  void goAway() => frames.first.add(
    jsonEncode({
      'goAway': {'timeLeft': '0s'},
    }),
  );

  void release() {
    for (final held in [previousClose, heldStop]) {
      if (!held.isCompleted) held.complete();
    }
  }

  Future<void> dispose() async {
    release();
    await cubit.close();
    for (final frame in frames) {
      await frame.close();
    }
  }
}

enum _Step { goAway, timer, retire, releaseClose, releaseStop }

List<List<_Step>> _orderings(List<_Step> steps) {
  if (steps.length <= 1) return [steps];
  return [
    for (final (index, step) in steps.indexed)
      for (final rest in _orderings([...steps]..removeAt(index)))
        [step, ...rest],
  ];
}

/// Native teardown needs real event-loop turns; the cubit's own work runs in
/// the fake zone, so alternate the two until [done] holds.
Future<void> _drive(WidgetTester tester, bool Function() done) async {
  for (var i = 0; i < 40 && !done(); i++) {
    await tester.runAsync(() => Future<void>.delayed(Duration.zero));
    await tester.pump(const Duration(milliseconds: 500));
  }
}

Future<void> _flush(WidgetTester tester) async {
  for (var i = 0; i < 4; i++) {
    await tester.pump();
  }
}

void main() {
  for (final retirement in ['End Call', 'close']) {
    test('$retirement fences an automatic replacement awaiting the previous '
        'socket close', () async {
      final t = _Transport();
      addTearDown(t.dispose);
      await t.cubit.prepareSession(wsId: 'ws', model: 'u1');
      expect(t.frames, hasLength(1));
      // GoAway schedules a reconnect whose connect waits on the old close.
      t.goAway();
      await t.previousClosing.future;
      final ending = retirement == 'End Call'
          ? t.cubit.disconnect(finishTurn: true)
          : t.cubit.close();
      await t.stopEntered.future;
      final before = t.frames.length;
      t.previousClose.complete();
      await Future<void>.delayed(const Duration(milliseconds: 20));
      final after = t.frames.length;
      final listenerAfterEnd = t.frames.length > 1 && t.frames[1].hasListener;
      t.heldStop.complete();
      await ending;
      expect(after, before, reason: 'a channel opened after $retirement');
      expect(listenerAfterEnd, isFalse);
    });
  }

  for (final retirement in ['End Call', 'close']) {
    for (final ordering in _orderings(const [
      _Step.goAway,
      _Step.timer,
      _Step.retire,
      _Step.releaseClose,
      _Step.releaseStop,
    ])) {
      final name = ordering.map((step) => step.name).join(' > ');
      testWidgets('$retirement transport fence: $name', (tester) async {
        final t = _Transport();
        unawaited(t.cubit.prepareSession(wsId: 'ws', model: 'u1'));
        await _flush(tester);
        expect(t.cubit.state.status, AssistantLiveConnectionStatus.connected);
        late final int retireStep;
        for (final (index, step) in ordering.indexed) {
          t.step = index + 1;
          switch (step) {
            case _Step.goAway:
              t.goAway();
              await _flush(tester);
            case _Step.timer:
              for (var i = 0; i < 5; i++) {
                await tester.pump(const Duration(milliseconds: 200));
              }
            case _Step.retire:
              retireStep = t.step;
              unawaited(
                retirement == 'End Call'
                    ? t.cubit.disconnect(finishTurn: true)
                    : t.cubit.close(),
              );
              await _flush(tester);
            case _Step.releaseClose:
              if (!t.previousClose.isCompleted) t.previousClose.complete();
              await _flush(tester);
            case _Step.releaseStop:
              if (!t.heldStop.isCompleted) t.heldStop.complete();
              await _flush(tester);
          }
        }
        t
          ..step = ordering.length + 1
          ..release();
        await _drive(
          tester,
          () => retirement == 'End Call'
              ? t.cubit.state.hasEnded
              : t.cubit.isClosed,
        );
        expect(
          t.openedSteps.where((opened) => opened >= retireStep),
          isEmpty,
          reason: 'a channel opened after $retirement',
        );
        if (retirement == 'End Call') {
          expect(
            t.cubit.state.status,
            AssistantLiveConnectionStatus.disconnected,
          );
          expect(t.cubit.state.hasEnded, isTrue);
        } else {
          expect(t.cubit.isClosed, isTrue);
        }
        var closed = false;
        unawaited(t.cubit.close().whenComplete(() => closed = true));
        await _drive(tester, () => closed);
        for (final frame in t.frames) {
          unawaited(frame.close());
        }
        await _flush(tester);
      });
    }
  }
}
