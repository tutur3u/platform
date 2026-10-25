import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_live_audio_player.dart';
import 'package:mobile/features/assistant/data/assistant_live_camera_service.dart';
import 'package:mobile/features/assistant/data/assistant_live_recorder.dart';
import 'package:mobile/features/assistant/data/assistant_live_repository.dart';
import 'package:mobile/features/assistant/data/assistant_live_screen_service.dart';
import 'package:mobile/features/assistant/models/assistant_live_dispatch.dart';
import 'package:mobile/features/assistant/models/assistant_live_models.dart';
import 'package:mocktail/mocktail.dart';

import 'live_dispatch_transport.dart';

class _Repository extends Mock implements AssistantLiveRepository {}

class _Player extends Mock implements AssistantLiveAudioPlayer {}

class _Camera extends Mock implements AssistantLiveCameraService {}

class _Recorder extends Mock implements AssistantLiveRecorder {}

class _Screen extends Mock implements AssistantLiveScreenService {}

const _envelope = AssistantLiveTokenEnvelope(
  token: 'synthetic-token',
  chatId: 'chat',
  scopeKey: 'scope',
  sessionHandle: null,
  model: 'model',
  seedHistory: [],
);
const _saveFailure = ApiException(
  message: 'Synthetic save failure',
  statusCode: 503,
);

class _Gate<T> {
  _Gate(this.value);

  final T value;
  final entered = Completer<void>();
  final released = Completer<T>();

  Future<T> wait() {
    entered.complete();
    return released.future;
  }

  void complete() {
    if (!released.isCompleted) released.complete(value);
  }
}

class _Fixture {
  _Fixture() {
    wire.autoReady = true;
    when(player.initialize).thenAnswer((_) async {});
    when(player.clear).thenAnswer((_) async {});
    when(player.pause).thenAnswer((_) async {
      pauses++;
    });
    when(player.dispose).thenAnswer((_) async {});
    when(recorder.stop).thenAnswer((_) async {
      recorderStops++;
    });
    when(recorder.dispose).thenAnswer((_) async {});
    when(camera.stopStreaming).thenAnswer((_) async {
      cameraStops++;
      final hook = nextCameraStop;
      nextCameraStop = null;
      await hook?.call();
    });
    when(camera.dispose).thenAnswer((_) async {});
    when(() => screen.isSupported).thenReturn(true);
    when(() => screen.requiresMicrophone).thenReturn(false);
    when(screen.stop).thenAnswer((_) async {
      screenStops++;
      final hook = nextScreenStop;
      nextScreenStop = null;
      await hook?.call();
    });
    when(
      () => repository.fetchLiveToken(
        wsId: any(named: 'wsId'),
        chatId: any(named: 'chatId'),
        model: any(named: 'model'),
        forceFresh: any(named: 'forceFresh'),
      ),
    ).thenAnswer((_) async {
      tokenCalls++;
      final hook = nextToken;
      nextToken = null;
      return hook == null ? _envelope : await hook();
    });
    when(
      () => repository.persistLiveTurn(
        wsId: any(named: 'wsId'),
        chatId: any(named: 'chatId'),
        turnId: any(named: 'turnId'),
        model: any(named: 'model'),
        messages: any(named: 'messages'),
      ),
    ).thenAnswer((invocation) async {
      writes.add((
        turnId: invocation.namedArguments[#turnId] as String,
        messages:
            invocation.namedArguments[#messages] as List<Map<String, dynamic>>,
      ));
      await onPersist?.call(writes.length);
    });
    cubit = AssistantLiveCubit(
      repository: repository,
      socket: wire.socket,
      audioPlayer: player,
      recorder: recorder,
      cameraService: camera,
      screenService: screen,
      currentUserId: () => actor,
      currentScopeToken: () => 0,
      onChatBound: (_, _) async {
        final hook = nextHistory;
        nextHistory = null;
        await hook?.call();
      },
      onHistoryUpdated: (_, _) async {
        historyUpdates++;
        final hook = nextHistoryUpdated;
        nextHistoryUpdated = null;
        await hook?.call();
      },
      isTurnRestored: (_, _, _, _) => confirmHistory,
    );
    subscription = cubit.stream.listen(states.add);
  }

  final repository = _Repository();
  final player = _Player();
  final recorder = _Recorder();
  final camera = _Camera();
  final screen = _Screen();
  final wire = LiveDispatchTransport();
  late final AssistantLiveCubit cubit;
  late final StreamSubscription<AssistantLiveState> subscription;
  final states = <AssistantLiveState>[];
  final writes = <({String turnId, List<Map<String, dynamic>> messages})>[];
  final releases = <void Function()>[];
  final operations = <Future<Object?>>[];
  String actor = 'actor-A';
  int tokenCalls = 0;
  int screenStops = 0;
  int recorderStops = 0;
  int cameraStops = 0;
  int pauses = 0;
  int historyUpdates = 0;
  bool confirmHistory = false;
  Future<AssistantLiveTokenEnvelope> Function()? nextToken;
  Future<void> Function()? nextHistory;
  Future<void> Function()? nextHistoryUpdated;
  Future<void> Function()? nextCameraStop;
  Future<void> Function()? nextScreenStop;
  Future<void> Function(int attempt)? onPersist;

  _Gate<T> gate<T>(T value) {
    final gate = _Gate(value);
    releases.add(gate.complete);
    return gate;
  }

  _Gate<void> holdPreparation(String boundary) {
    final gate = this.gate<void>(null);
    if (boundary == 'token') {
      nextToken = () async {
        await gate.wait();
        return _envelope;
      };
    } else {
      nextHistory = gate.wait;
    }
    return gate;
  }

  _Gate<void> holdScreenTeardown() {
    // Seed retained native capture without running a capture plugin.
    cubit.emit(cubit.state.copyWith(isScreenSharing: true));
    final gate = this.gate<void>(null);
    nextScreenStop = gate.wait;
    return gate;
  }

  Future<AssistantLiveDispatch> send(
    String text, {
    bool Function()? isCurrent,
  }) {
    final operation = cubit.sendTypedMessage(
      wsId: 'ws',
      text: text,
      attachments: const [],
      isCurrent: isCurrent,
    );
    operations.add(operation);
    return operation;
  }

  Iterable<Map<String, dynamic>> get setupFrames =>
      wire.admitted.where((frame) => frame.containsKey('setup'));
  Iterable<Map<String, dynamic>> get inputFrames =>
      wire.admitted.where((frame) => frame.containsKey('realtimeInput'));

  void expectNoCleanup() {
    expect(recorderStops, 0);
    expect(cameraStops, 0);
    expect(pauses, 0);
  }

  void expectNoFrames() {
    expect(wire.admitted, isEmpty);
    expect(wire.textAttempts, 0);
    expect(wire.texts, isEmpty);
    expect(cubit.state.userDraft, isEmpty);
  }

  Future<void> dispose() async {
    for (final release in releases) {
      release();
    }
    await Future.wait(operations);
    await cubit.close();
    await subscription.cancel();
    await wire.dispose();
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late _Fixture f;
  setUp(() => f = _Fixture());
  tearDown(() => f.dispose());

  for (final boundary in ['token', 'history']) {
    test('typed replacement supersedes plain $boundary preparation', () async {
      final oldGate = f.holdPreparation(boundary);
      final old = f.cubit.prepareSession(wsId: 'ws');
      f.operations.add(old);
      await oldGate.entered.future;
      final teardown = f.holdScreenTeardown();
      final replacement = f.send('Replacement question');
      await teardown.entered.future;
      final heldState = f.cubit.state;
      expect(f.tokenCalls, 1);
      f.expectNoFrames();

      oldGate.complete();
      expect(await old, isNull);
      expect(teardown.released.isCompleted, isFalse);
      expect(f.cubit.state, heldState);
      expect(f.tokenCalls, 1);
      expect(f.screenStops, 1);
      f
        ..expectNoCleanup()
        ..expectNoFrames();

      teardown.complete();
      expect(await replacement, AssistantLiveDispatch.dispatched);
      expect(f.cubit.state.status, AssistantLiveConnectionStatus.connected);
      expect(f.cubit.state.userDraft, 'Replacement question');
      expect(f.tokenCalls, 2);
      expect(f.wire.textAttempts, 1);
      expect(f.wire.texts, ['Replacement question']);
      expect(f.wire.admitted, hasLength(2));
      f.expectNoCleanup();
    });
  }

  for (final boundary in ['token', 'history']) {
    test(
      'old $boundary cleanup cannot retire replacement in screen teardown',
      () async {
        final oldGate = f.holdPreparation(boundary);
        final old = f.send('Old question');
        await oldGate.entered.future;
        final teardown = f.holdScreenTeardown();
        final replacement = f.send('Replacement question');
        await teardown.entered.future;
        final heldState = f.cubit.state;
        f.states.clear();
        expect(
          heldState.status,
          boundary == 'token'
              ? AssistantLiveConnectionStatus.preparing
              : AssistantLiveConnectionStatus.connecting,
        );
        expect(f.tokenCalls, 1);
        expect(f.screenStops, 1);
        f.expectNoFrames();

        oldGate.complete();
        expect(await old, AssistantLiveDispatch.stale);
        expect(teardown.released.isCompleted, isFalse);
        expect(f.cubit.state, heldState);
        expect(f.tokenCalls, 1);
        expect(f.screenStops, 1);
        f
          ..expectNoCleanup()
          ..expectNoFrames();

        teardown.complete();
        expect(await replacement, AssistantLiveDispatch.dispatched);
        expect(f.cubit.state.status, AssistantLiveConnectionStatus.connected);
        expect(f.cubit.state.userDraft, 'Replacement question');
        expect(f.cubit.state.isScreenSharing, isFalse);
        expect(f.tokenCalls, 2);
        expect(f.screenStops, 1);
        f.expectNoCleanup();
        expect(f.wire.textAttempts, 1);
        expect(f.wire.texts, ['Replacement question']);
        expect(f.wire.admitted, hasLength(2));
        expect(f.wire.admitted.first, contains('setup'));
        expect(f.wire.admitted.last, {
          'realtimeInput': {'text': 'Replacement question'},
        });
        expect(
          f.states.where(
            (state) =>
                state.status == AssistantLiveConnectionStatus.disconnected,
          ),
          isEmpty,
        );
      },
    );

    test('abandoned $boundary still cleans up without replacement', () async {
      final oldGate = f.holdPreparation(boundary);
      var pageCurrent = true;
      final old = f.send('Abandoned question', isCurrent: () => pageCurrent);
      await oldGate.entered.future;
      pageCurrent = false;
      oldGate.complete();
      expect(await old, AssistantLiveDispatch.stale);
      expect(f.cubit.state.status, AssistantLiveConnectionStatus.disconnected);
      expect(f.screenStops, 1);
      expect(f.recorderStops, 1);
      expect(f.cameraStops, 1);
      expect(f.pauses, 1);
      f.expectNoFrames();
    });
  }

  for (final retirement in ['manual', 'actor']) {
    test('$retirement retirement still rejects held replacement', () async {
      final oldGate = f.holdPreparation('token');
      final old = f.send('Old question');
      await oldGate.entered.future;
      final teardown = f.holdScreenTeardown();
      final replacement = f.send('Retired replacement');
      await teardown.entered.future;
      if (retirement == 'manual') {
        await f.cubit.disconnect();
      } else {
        f.actor = 'actor-B';
      }
      oldGate.complete();
      expect(await old, AssistantLiveDispatch.stale);
      expect(teardown.released.isCompleted, isFalse);
      expect(f.tokenCalls, 1);
      f.expectNoFrames();
      teardown.complete();
      expect(await replacement, AssistantLiveDispatch.stale);
      expect(f.tokenCalls, 1);
      f.expectNoFrames();
      if (retirement == 'manual') {
        expect(
          f.cubit.state.status,
          AssistantLiveConnectionStatus.disconnected,
        );
        expect(f.screenStops, 2);
        expect(f.recorderStops, 1);
        expect(f.cameraStops, 1);
        expect(f.pauses, 1);
      } else {
        expect(f.cubit.state.status, AssistantLiveConnectionStatus.preparing);
        expect(f.screenStops, 1);
        f.expectNoCleanup();
      }
    });
  }

  test(
    'old token cleanup preserves replacement retry wait and pending turn',
    () async {
      final retry = f.gate<void>(null);
      f.onPersist = (attempt) async {
        if (attempt == 3) await retry.wait();
        if (attempt <= 3) throw _saveFailure;
      };
      expect(
        await f.send('Retained question'),
        AssistantLiveDispatch.dispatched,
      );
      final failedSave = f.cubit.stream.firstWhere(
        (state) =>
            state.status == AssistantLiveConnectionStatus.error &&
            state.completedTurns.length == 1 &&
            !state.isPersisting,
      );
      f.wire.frames.add(
        '{"serverContent":{"modelTurn":{"parts":[{"text":"Retained answer"}]}, '
        '"turnComplete":true}}',
      );
      await failedSave;
      final retained = f.cubit.state.completedTurns.single;
      expect(retained.userText, 'Retained question');
      expect(retained.assistantText, 'Retained answer');
      expect(f.writes, hasLength(1));

      final oldGate = f.holdPreparation('token');
      final old = f.send('Old question');
      await oldGate.entered.future;
      expect(f.writes, hasLength(2));
      final replacement = f.send('Replacement question');
      await retry.entered.future;
      final heldState = f.cubit.state;
      f.states.clear();
      final heldFrames = List<Map<String, dynamic>>.of(f.wire.admitted);
      final heldStops = f.screenStops;
      expect(f.writes, hasLength(3));
      expect(heldState.completedTurns, [retained]);
      expect(heldState.isPersisting, isTrue);
      expect(f.tokenCalls, 2);
      expect(f.wire.texts, ['Retained question']);

      oldGate.complete();
      expect(await old, AssistantLiveDispatch.stale);
      expect(retry.released.isCompleted, isFalse);
      expect(f.cubit.state, heldState);
      expect(f.wire.admitted, heldFrames);
      expect(f.wire.textAttempts, 1);
      expect(f.tokenCalls, 2);
      expect(f.screenStops, heldStops);
      f.expectNoCleanup();

      retry.complete();
      expect(await replacement, AssistantLiveDispatch.dispatched);
      expect(f.cubit.state.status, AssistantLiveConnectionStatus.connected);
      expect(f.cubit.state.userDraft, 'Replacement question');
      expect(f.cubit.state.completedTurns, [retained]);
      expect(f.writes, hasLength(3));
      expect(f.tokenCalls, 3);
      expect(f.wire.textAttempts, 2);
      expect(f.wire.texts, ['Retained question', 'Replacement question']);
      expect(f.wire.admitted, hasLength(4));
      expect(f.setupFrames, hasLength(2));
      final inputFrames = f.inputFrames.toList();
      expect(inputFrames, [
        {
          'realtimeInput': {'text': 'Retained question'},
        },
        {
          'realtimeInput': {'text': 'Replacement question'},
        },
      ]);
      f
        ..expectNoCleanup()
        ..confirmHistory = true;
      // Public retry reconnects: one setup frame, no repeated text input.
      await f.cubit.retry();
      expect(f.writes, hasLength(4));
      expect(f.writes.map((write) => write.turnId).toSet(), {retained.id});
      for (final write in f.writes) {
        expect(write.messages, f.writes.first.messages);
        expect(write.messages.map((message) => message['content']), [
          'Retained question',
          'Retained answer',
        ]);
      }
      expect(f.historyUpdates, 1);
      expect(f.cubit.state.completedTurns, isEmpty);
      expect(f.cubit.state.isPersisting, isFalse);
      expect(f.cubit.state.status, AssistantLiveConnectionStatus.connected);
      expect(f.cubit.state.userDraft, 'Replacement question');
      expect(f.tokenCalls, 4);
      expect(f.wire.admitted, hasLength(5));
      expect(f.setupFrames, hasLength(3));
      expect(f.inputFrames, inputFrames);
      await f.cubit.retry();
      expect(f.writes, hasLength(4));
      expect(f.wire.admitted, hasLength(6));
      expect(f.setupFrames, hasLength(4));
      expect(f.inputFrames, inputFrames);
      expect(f.tokenCalls, 5);
      expect(f.wire.textAttempts, 2);
      expect(f.wire.texts, ['Retained question', 'Replacement question']);
      expect(
        f.states.where(
          (state) => state.status == AssistantLiveConnectionStatus.disconnected,
        ),
        isEmpty,
      );
    },
  );

  test(
    'successful retry revoking page lease settles inherited setup',
    () async {
      final retry = f.gate<void>(null);
      f.onPersist = (attempt) async {
        if (attempt == 3) await retry.wait();
        if (attempt < 3) throw _saveFailure;
      };
      expect(
        await f.send('Retained question'),
        AssistantLiveDispatch.dispatched,
      );
      final failedSave = f.cubit.stream.firstWhere(
        (state) =>
            state.status == AssistantLiveConnectionStatus.error &&
            state.completedTurns.length == 1 &&
            !state.isPersisting,
      );
      f.wire.frames.add(
        '{"serverContent":{"modelTurn":{"parts":[{"text":"Retained answer"}]}, '
        '"turnComplete":true}}',
      );
      await failedSave;
      final retained = f.cubit.state.completedTurns.single;
      expect(f.writes, hasLength(1));
      final oldGate = f.holdPreparation('token');
      final old = f.send('Old question');
      await oldGate.entered.future;
      expect(f.writes, hasLength(2));
      var pageCurrent = true;
      final replacement = f.send(
        'Replacement question',
        isCurrent: () => pageCurrent,
      );
      await retry.entered.future;
      final heldState = f.cubit.state;
      final heldFrames = List<Map<String, dynamic>>.of(f.wire.admitted);
      f.states.clear();
      expect(heldState.status, AssistantLiveConnectionStatus.preparing);
      expect(heldState.completedTurns, [retained]);
      expect(heldState.isPersisting, isTrue);
      expect(f.writes, hasLength(3));
      expect(f.tokenCalls, 2);
      oldGate.complete();
      expect(await old, AssistantLiveDispatch.stale);
      expect(retry.released.isCompleted, isFalse);
      expect(f.cubit.state, heldState);
      expect(f.wire.admitted, heldFrames);
      f.expectNoCleanup();

      f
        ..confirmHistory = true
        ..nextHistoryUpdated = () async {
          expect(f.cubit.state.completedTurns, [retained]);
          expect(f.cubit.state.isPersisting, isTrue);
          pageCurrent = false;
        };
      final screenStopsBeforeCleanup = f.screenStops;
      expect(screenStopsBeforeCleanup, 2);
      retry.complete();
      expect(await replacement, AssistantLiveDispatch.stale);
      expect(pageCurrent, isFalse);
      expect(f.historyUpdates, 1);
      expect(f.cubit.state.status, AssistantLiveConnectionStatus.disconnected);
      expect(f.cubit.state.isBusy, isFalse);
      expect(f.cubit.state.completedTurns, isEmpty);
      expect(f.cubit.state.isPersisting, isFalse);
      expect(f.cubit.state.userDraft, isEmpty);
      expect(f.cubit.state.assistantDraft, isEmpty);
      expect(f.screenStops, screenStopsBeforeCleanup + 1);
      expect(f.recorderStops, 1);
      expect(f.cameraStops, 1);
      expect(f.pauses, 1);
      expect(f.writes, hasLength(3));
      expect(f.writes.map((write) => write.turnId).toSet(), {retained.id});
      for (final write in f.writes) {
        expect(write.messages, f.writes.first.messages);
        expect(write.messages.map((message) => message['content']), [
          'Retained question',
          'Retained answer',
        ]);
      }
      expect(f.tokenCalls, 2);
      expect(f.wire.admitted, heldFrames);
      expect(f.wire.textAttempts, 1);
      expect(f.wire.texts, ['Retained question']);
      expect(
        f.states.where(
          (state) => state.status == AssistantLiveConnectionStatus.connected,
        ),
        isEmpty,
      );
      // A retired page cannot start setup after its prior attempt disconnected.
      final disconnected = f.cubit.state;
      expect(
        await f.cubit.prepareSession(wsId: 'ws', isCurrent: () => pageCurrent),
        isNull,
      );
      expect(f.cubit.state, disconnected);
      expect(f.tokenCalls, 2);
      expect(f.setupFrames, hasLength(1));
      expect(f.wire.textAttempts, 1);
      expect(f.writes, hasLength(3));
      expect(f.historyUpdates, 1);
      expect(f.cubit.state.completedTurns, isEmpty);
      expect(f.cubit.state.status, AssistantLiveConnectionStatus.disconnected);
      expect(f.wire.admitted, heldFrames);
    },
  );

  for (final boundary in ['token', 'history']) {
    test('running $boundary cleanup yields after camera await', () async {
      final oldGate = f.holdPreparation(boundary);
      var pageCurrent = true;
      final old = f.send('Abandoned question', isCurrent: () => pageCurrent);
      await oldGate.entered.future;
      final cameraCleanup = f.gate<void>(null);
      f.nextCameraStop = cameraCleanup.wait;
      pageCurrent = false;
      oldGate.complete();
      await cameraCleanup.entered.future;
      expect(f.screenStops, 1);
      expect(f.recorderStops, 1);
      expect(f.cameraStops, 1);
      expect(f.pauses, 0);

      final teardown = f.holdScreenTeardown();
      final replacement = f.send('Replacement question');
      await teardown.entered.future;
      final heldState = f.cubit.state;
      f.states.clear();
      expect(
        heldState.status,
        boundary == 'token'
            ? AssistantLiveConnectionStatus.preparing
            : AssistantLiveConnectionStatus.connecting,
      );
      expect(heldState.isScreenSharing, isTrue);
      expect(heldState.completedTurns, isEmpty);
      expect(f.tokenCalls, 1);
      expect(f.screenStops, 2);
      f.expectNoFrames();

      cameraCleanup.complete();
      expect(await old, AssistantLiveDispatch.stale);
      expect(teardown.released.isCompleted, isFalse);
      expect(f.cubit.state, heldState);
      expect(f.cubit.state.completedTurns, heldState.completedTurns);
      expect(f.states, isEmpty);
      expect(f.tokenCalls, 1);
      expect(f.screenStops, 2);
      expect(f.recorderStops, 1);
      expect(f.cameraStops, 1);
      expect(f.pauses, 0);
      f.expectNoFrames();

      teardown.complete();
      expect(await replacement, AssistantLiveDispatch.dispatched);
      expect(f.cubit.state.status, AssistantLiveConnectionStatus.connected);
      expect(f.cubit.state.userDraft, 'Replacement question');
      expect(f.cubit.state.isScreenSharing, isFalse);
      expect(f.cubit.state.completedTurns, isEmpty);
      expect(f.writes, isEmpty);
      expect(f.tokenCalls, 2);
      expect(f.screenStops, 2);
      expect(f.recorderStops, 1);
      expect(f.cameraStops, 1);
      expect(f.pauses, 0);
      expect(f.wire.textAttempts, 1);
      expect(f.wire.texts, ['Replacement question']);
      expect(f.wire.admitted, hasLength(2));
      expect(f.wire.admitted.first, contains('setup'));
      expect(f.wire.admitted.last, {
        'realtimeInput': {'text': 'Replacement question'},
      });
      expect(
        f.states.where(
          (state) => state.status == AssistantLiveConnectionStatus.disconnected,
        ),
        isEmpty,
      );
    });
  }
}
