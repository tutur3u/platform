import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/data/assistant_live_audio_player.dart';
import 'package:mobile/features/assistant/data/assistant_live_camera_service.dart';
import 'package:mobile/features/assistant/data/assistant_live_recorder.dart';
import 'package:mobile/features/assistant/data/assistant_live_repository.dart';
import 'package:mobile/features/assistant/models/assistant_live_dispatch.dart';
import 'package:mobile/features/assistant/models/assistant_live_models.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mocktail/mocktail.dart';

import 'live_dispatch_transport.dart';

class _Repository extends Mock implements AssistantLiveRepository {}

class _Player extends Mock implements AssistantLiveAudioPlayer {}

class _Camera extends Mock implements AssistantLiveCameraService {}

class _Recorder extends Mock implements AssistantLiveRecorder {}

class _File extends Mock implements File {}

const _envelope = AssistantLiveTokenEnvelope(
  token: 'synthetic-token',
  chatId: 'chat',
  scopeKey: 'scope',
  sessionHandle: null,
  model: 'model',
  seedHistory: [],
);
const _image = AssistantAttachment(
  id: 'image',
  name: 'image.png',
  size: 1,
  type: 'image/png',
  localPath: 'synthetic/image.png',
  storagePath: 'uploaded/image.png',
  uploadState: AssistantAttachmentUploadState.uploaded,
);

class _Fixture {
  _Fixture() {
    wire.autoReady = true;
    when(player.initialize).thenAnswer((_) async {});
    when(player.clear).thenAnswer((_) async {});
    when(player.pause).thenAnswer((_) async {});
    when(player.dispose).thenAnswer((_) async {});
    when(recorder.stop).thenAnswer((_) async {});
    when(recorder.dispose).thenAnswer((_) async {});
    when(camera.stopStreaming).thenAnswer((_) async {});
    when(camera.dispose).thenAnswer((_) async {});
    when(
      () => repository.fetchLiveToken(
        wsId: any(named: 'wsId'),
        chatId: any(named: 'chatId'),
        model: any(named: 'model'),
        forceFresh: any(named: 'forceFresh'),
      ),
    ).thenAnswer((_) async {
      tokenEntered?.complete();
      tokenEntered = null;
      return tokenGate == null ? _envelope : await tokenGate!.future;
    });
    cubit = AssistantLiveCubit(
      repository: repository,
      socket: wire.socket,
      audioPlayer: player,
      recorder: recorder,
      cameraService: camera,
      currentUserId: () => actor,
      currentScopeToken: () => scope,
      onChatBound: (_, _) async {
        await onBound?.call();
      },
      onHistoryUpdated: (_, _) async {},
    );
  }

  final repository = _Repository();
  final player = _Player();
  final recorder = _Recorder();
  final camera = _Camera();
  final wire = LiveDispatchTransport();
  late final AssistantLiveCubit cubit;
  String actor = 'actor-A';
  int scope = 0;
  Future<void> Function()? onBound;
  Completer<void>? tokenEntered;
  Completer<AssistantLiveTokenEnvelope>? tokenGate;

  Future<AssistantLiveDispatch> send({
    String text = 'Captured question',
    List<AssistantAttachment> attachments = const [],
    bool Function()? isCurrent,
  }) => cubit.sendTypedMessage(
    wsId: 'ws',
    text: text,
    attachments: attachments,
    isCurrent: isCurrent,
  );

  Future<void> dispose() async {
    if (tokenGate case final gate? when !gate.isCompleted) {
      gate.complete(_envelope);
    }
    await cubit.close();
    await wire.dispose();
  }
}

Future<void> _driveTypedFuture(
  WidgetTester tester,
  Future<void> operation, {
  required String reason,
}) async {
  var completed = false;
  AsyncError? failure;
  final observed = operation.then<void>(
    (_) => completed = true,
    onError: (Object error, StackTrace stack) {
      failure = AsyncError(error, stack);
      completed = true;
    },
  );
  final budget = Stopwatch()..start();
  while (!completed && budget.elapsed < const Duration(seconds: 3)) {
    await tester.runAsync(() => Future<void>.delayed(Duration.zero));
    await tester.idle();
  }
  expect(completed, isTrue, reason: reason);
  await observed;
  if (failure case final error?) {
    Error.throwWithStackTrace(error.error, error.stackTrace);
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late _Fixture f;
  setUp(() => f = _Fixture());
  tearDown(() => f.dispose());

  test(
    'one local sink admission is dispatched without a durable ACK',
    () async {
      final result = await f.send();
      expect(result, AssistantLiveDispatch.dispatched);
      expect(f.wire.texts, ['Captured question']);
      expect(f.cubit.state.userDraft, 'Captured question');
      expect(f.cubit.state.completedTurns, isEmpty);
      expect(f.cubit.state.isPersisting, isFalse);
      verifyNever(
        () => f.repository.persistLiveTurn(
          wsId: any(named: 'wsId'),
          chatId: any(named: 'chatId'),
          turnId: any(named: 'turnId'),
          model: any(named: 'model'),
          messages: any(named: 'messages'),
        ),
      );
    },
  );

  test('empty input refuses before token or transport admission', () async {
    expect(await f.send(text: '  '), AssistantLiveDispatch.refused);
    expect(f.wire.admitted, isEmpty);
    expect(f.cubit.state.userDraft, isEmpty);
  });

  for (final change in ['actor', 'scope ABA', 'request', 'page scope']) {
    test('$change during token await prevents every local dispatch', () async {
      final entered = Completer<void>();
      final gate = Completer<AssistantLiveTokenEnvelope>();
      f
        ..tokenEntered = entered
        ..tokenGate = gate;
      var pageCurrent = true;
      final sending = f.send(isCurrent: () => pageCurrent);
      await entered.future;
      switch (change) {
        case 'actor':
          f.actor = 'actor-B';
        case 'scope ABA':
          f.scope += 2;
        case 'request':
          await f.cubit.disconnect();
        case 'page scope':
          pageCurrent = false;
      }
      gate.complete(_envelope);
      expect(await sending, AssistantLiveDispatch.stale);
      expect(f.wire.texts, isEmpty);
      expect(f.cubit.state.userDraft, isEmpty);
    });
  }

  for (final phase in ['history', 'audio']) {
    for (final change in ['actor', 'request', 'page scope']) {
      test('$change during $phase await prevents socket admission', () async {
        final entered = Completer<void>();
        final gate = Completer<void>();
        Future<void> hold() {
          entered.complete();
          return gate.future;
        }

        if (phase == 'history') {
          f.onBound = hold;
        } else {
          when(f.player.initialize).thenAnswer((_) => hold());
        }
        var pageCurrent = true;
        final sending = f.send(isCurrent: () => pageCurrent);
        await entered.future;
        switch (change) {
          case 'actor':
            f.actor = 'actor-B';
          case 'request':
            await f.cubit.disconnect();
          case 'page scope':
            pageCurrent = false;
        }
        gate.complete();
        expect(await sending, AssistantLiveDispatch.stale);
        expect(f.wire.admitted, isEmpty);
        expect(f.cubit.state.userDraft, isEmpty);
      });
    }
  }

  for (final boundary in ['token', 'history']) {
    test(
      'obsolete $boundary cleanup preserves a held replacement prepare',
      () async {
        final entered = Completer<void>();
        final oldToken = Completer<AssistantLiveTokenEnvelope>();
        final oldHistory = Completer<void>();
        if (boundary == 'token') {
          f
            ..tokenEntered = entered
            ..tokenGate = oldToken;
        } else {
          f.onBound = () {
            entered.complete();
            return oldHistory.future;
          };
        }
        var oldCurrent = true;
        final old = f.send(isCurrent: () => oldCurrent);
        await entered.future;
        expect(
          f.cubit.state.status,
          boundary == 'token'
              ? AssistantLiveConnectionStatus.preparing
              : AssistantLiveConnectionStatus.connecting,
        );
        oldCurrent = false;
        final replacementEntered = Completer<void>();
        final replacementToken = Completer<AssistantLiveTokenEnvelope>();
        f
          ..onBound = null
          ..tokenEntered = replacementEntered
          ..tokenGate = replacementToken;
        final replacement = f.cubit.prepareSession(wsId: 'ws');
        await replacementEntered.future;
        expect(f.cubit.state.status, AssistantLiveConnectionStatus.preparing);
        if (boundary == 'token') {
          oldToken.complete(_envelope);
        } else {
          oldHistory.complete();
        }
        expect(await old, AssistantLiveDispatch.stale);
        expect(f.cubit.state.status, AssistantLiveConnectionStatus.preparing);
        expect(replacementToken.isCompleted, isFalse);
        expect(f.wire.admitted, isEmpty);
        expect(f.wire.textAttempts, 0);
        expect(f.cubit.state.userDraft, isEmpty);
        replacementToken.complete(_envelope);
        expect(await replacement, isNotNull);
        expect(f.cubit.state.status, AssistantLiveConnectionStatus.connected);
        expect(
          await f.send(text: 'Replacement turn'),
          AssistantLiveDispatch.dispatched,
        );
        expect(f.wire.texts, ['Replacement turn']);
        expect(f.wire.textAttempts, 1);
      },
    );
  }

  test('obsolete camera cleanup preserves replacement microphone', () async {
    final tokenEntered = Completer<void>();
    final oldToken = Completer<AssistantLiveTokenEnvelope>();
    final cleanupEntered = Completer<void>();
    final cameraCleanup = Completer<void>();
    var holdCleanup = true;
    when(f.camera.stopStreaming).thenAnswer((_) {
      if (!holdCleanup) return Future<void>.value();
      holdCleanup = false;
      cleanupEntered.complete();
      return cameraCleanup.future;
    });
    f
      ..tokenEntered = tokenEntered
      ..tokenGate = oldToken;
    var oldCurrent = true;
    final old = f.send(isCurrent: () => oldCurrent);
    try {
      await tokenEntered.future;
      oldCurrent = false;
      oldToken.complete(_envelope);
      await cleanupEntered.future;
      expect(cameraCleanup.isCompleted, isFalse);
      f.tokenGate = null;
      expect(await f.cubit.prepareSession(wsId: 'ws'), isNotNull);
      expect(f.cubit.state.status, AssistantLiveConnectionStatus.connected);
      f.cubit.emit(
        f.cubit.state.copyWith(isMicrophoneActive: true, audioLevel: 0.5),
      );
      final replacementState = f.cubit.state;
      expect(replacementState.isMicrophoneActive, isTrue);
      cameraCleanup.complete();
      expect(await old, AssistantLiveDispatch.stale);
      expect(f.cubit.state.status, AssistantLiveConnectionStatus.connected);
      expect(f.cubit.state.isMicrophoneActive, isTrue);
      expect(f.cubit.state.audioLevel, 0.5);
      expect(f.cubit.state, replacementState);
      expect(f.wire.textAttempts, 0);
      expect(f.wire.texts, isEmpty);
      expect(f.cubit.state.userDraft, isEmpty);
      expect(
        f.wire.admitted.where((frame) => frame.containsKey('realtimeInput')),
        isEmpty,
      );
      expect(
        await f.send(text: 'Replacement microphone turn'),
        AssistantLiveDispatch.dispatched,
      );
      expect(f.wire.texts, ['Replacement microphone turn']);
      expect(f.wire.textAttempts, 1);
    } finally {
      if (!oldToken.isCompleted) oldToken.complete(_envelope);
      if (!cameraCleanup.isCompleted) cameraCleanup.complete();
      await old;
    }
  });

  for (final change in ['actor', 'scope ABA', 'request', 'page scope']) {
    test('$change during image read prevents every local dispatch', () async {
      await f.cubit.prepareSession(wsId: 'ws');
      final file = _File();
      final entered = Completer<void>();
      final bytes = Completer<Uint8List>();
      when(file.readAsBytes).thenAnswer((_) {
        entered.complete();
        return bytes.future;
      });
      await IOOverrides.runZoned(() async {
        var pageCurrent = true;
        final sending = f.send(
          attachments: [_image],
          isCurrent: () => pageCurrent,
        );
        await entered.future;
        switch (change) {
          case 'actor':
            f.actor = 'actor-B';
          case 'scope ABA':
            f.scope += 2;
          case 'request':
            await f.cubit.disconnect();
          case 'page scope':
            pageCurrent = false;
        }
        bytes.complete(Uint8List.fromList([1, 2, 3]));
        expect(await sending, AssistantLiveDispatch.stale);
        expect(f.wire.texts, isEmpty);
        expect(f.cubit.state.userDraft, isEmpty);
        expect(
          f.wire.admitted.where((frame) => frame.containsKey('realtimeInput')),
          isEmpty,
        );
      }, createFile: (_) => file);
    });
  }

  test('manual retirement survives replacement preparation', () async {
    await f.cubit.prepareSession(wsId: 'ws');
    final file = _File();
    final entered = Completer<void>();
    final bytes = Completer<Uint8List>();
    when(file.readAsBytes).thenAnswer((_) {
      entered.complete();
      return bytes.future;
    });
    await IOOverrides.runZoned(() async {
      final old = f.send(attachments: [_image]);
      await entered.future;
      final dropped = f.cubit.stream.firstWhere(
        (state) => state.status == AssistantLiveConnectionStatus.error,
      );
      f.wire.frames.addError(StateError('Synthetic transport loss'));
      await dropped;
      await f.cubit.disconnect();
      final replacementEntered = Completer<void>();
      final replacementToken = Completer<AssistantLiveTokenEnvelope>();
      f
        ..tokenEntered = replacementEntered
        ..tokenGate = replacementToken;
      final replacement = f.cubit.prepareSession(wsId: 'ws');
      await replacementEntered.future;
      final replacementState = f.cubit.state;
      expect(replacementState.status, AssistantLiveConnectionStatus.preparing);
      bytes.complete(
        Uint8List.fromList(img.encodePng(img.Image(width: 1, height: 1))),
      );
      expect(await old, AssistantLiveDispatch.stale);
      expect(f.wire.textAttempts, 0);
      expect(f.wire.texts, isEmpty);
      expect(f.cubit.state.userDraft, isEmpty);
      expect(f.cubit.state, replacementState);
      expect(replacementToken.isCompleted, isFalse);
      expect(
        f.wire.admitted.where((frame) => frame.containsKey('realtimeInput')),
        isEmpty,
      );
      replacementToken.complete(_envelope);
      expect(await replacement, isNotNull);
      expect(f.cubit.state.status, AssistantLiveConnectionStatus.connected);
      expect(
        await f.send(text: 'Replacement turn'),
        AssistantLiveDispatch.dispatched,
      );
      expect(f.wire.texts, ['Replacement turn']);
      expect(f.wire.textAttempts, 1);
    }, createFile: (_) => file);
  });

  for (final loss in ['error', 'closed']) {
    for (final change in [
      'current',
      'actor',
      'scope ABA',
      'request',
      'page scope',
      'newer invocation',
    ]) {
      test(
        '$loss during image read is refused only for $change scope',
        () async {
          await f.cubit.prepareSession(wsId: 'ws');
          final file = _File();
          final entered = Completer<void>();
          final bytes = Completer<Uint8List>();
          when(file.readAsBytes).thenAnswer((_) {
            entered.complete();
            return bytes.future;
          });
          await IOOverrides.runZoned(() async {
            var pageCurrent = true;
            final sending = f.send(
              attachments: [_image],
              isCurrent: () => pageCurrent,
            );
            await entered.future;
            final dropped = f.cubit.stream.firstWhere(
              (state) =>
                  state.status ==
                  (loss == 'error'
                      ? AssistantLiveConnectionStatus.error
                      : AssistantLiveConnectionStatus.reconnecting),
            );
            if (loss == 'error') {
              f.wire.frames.addError(StateError('Synthetic transport loss'));
            } else {
              unawaited(f.wire.frames.close());
            }
            await dropped;
            switch (change) {
              case 'current':
                break;
              case 'actor':
                f.actor = 'actor-B';
              case 'scope ABA':
                f.scope += 2;
              case 'request':
                await f.cubit.disconnect();
              case 'page scope':
                pageCurrent = false;
              case 'newer invocation':
                expect(await f.send(text: ''), AssistantLiveDispatch.refused);
            }
            bytes.complete(
              Uint8List.fromList(img.encodePng(img.Image(width: 1, height: 1))),
            );
            expect(
              await sending,
              change == 'current'
                  ? AssistantLiveDispatch.refused
                  : AssistantLiveDispatch.stale,
            );
            expect(f.wire.textAttempts, 0);
            expect(f.wire.texts, isEmpty);
            expect(f.cubit.state.userDraft, isEmpty);
            expect(
              f.wire.admitted.where(
                (frame) => frame.containsKey('realtimeInput'),
              ),
              isEmpty,
            );
          }, createFile: (_) => file);
        },
      );
    }
  }

  testWidgets('transport loss during preparation refuses the current send', (
    tester,
  ) async {
    final local = _Fixture();
    try {
      final setupEntered = Completer<void>();
      local.wire
        ..autoReady = false
        ..onSetup = setupEntered.complete;
      AssistantLiveDispatch? outcome;
      final sending = local.send().then<void>((result) => outcome = result);
      await tester.pump();
      expect(setupEntered.isCompleted, isTrue);
      expect(
        local.cubit.state.status,
        AssistantLiveConnectionStatus.connecting,
      );
      final recoveryEntered = Completer<void>();
      final recoveryToken = Completer<AssistantLiveTokenEnvelope>();
      local
        ..tokenEntered = recoveryEntered
        ..tokenGate = recoveryToken;
      local.wire.frames.addError(
        StateError('Synthetic preparation transport loss'),
      );
      await tester.pump();
      expect(local.cubit.state.status, AssistantLiveConnectionStatus.error);
      expect(recoveryEntered.isCompleted, isFalse);
      await tester.pump(const Duration(milliseconds: 800));
      expect(recoveryEntered.isCompleted, isTrue);
      expect(
        local.cubit.state.status,
        AssistantLiveConnectionStatus.reconnecting,
      );
      expect(outcome, isNull);
      final recoveryState = local.cubit.state;
      // The real reconnect timer has fired; finish the original 20s watchdog.
      await tester.pump(const Duration(milliseconds: 19200));
      expect(outcome, AssistantLiveDispatch.refused);
      await sending;
      expect(recoveryToken.isCompleted, isFalse);
      expect(local.cubit.state, recoveryState);
      expect(local.wire.textAttempts, 0);
      expect(local.wire.texts, isEmpty);
      expect(local.cubit.state.userDraft, isEmpty);
      expect(
        local.wire.admitted.where((frame) => frame.containsKey('setup')).length,
        1,
      );
      expect(
        local.wire.admitted.where(
          (frame) => frame.containsKey('realtimeInput'),
        ),
        isEmpty,
      );
      final recovered = local.cubit.stream
          .firstWhere(
            (state) => state.status == AssistantLiveConnectionStatus.connected,
          )
          .then<void>((_) {});
      local.wire
        ..autoReady = true
        ..onSetup = null;
      recoveryToken.complete(_envelope);
      await _driveTypedFuture(
        tester,
        recovered,
        reason: 'Held automatic recovery must retain preparation ownership',
      );
      expect(local.cubit.state.status, AssistantLiveConnectionStatus.connected);
      expect(local.wire.textAttempts, 0);
      expect(local.wire.texts, isEmpty);
      expect(local.cubit.state.userDraft, isEmpty);
    } finally {
      await _driveTypedFuture(
        tester,
        local.dispose(),
        reason: 'The widget-owned fixture must close before the body returns',
      );
    }
  });

  test('newer invocation owns readiness and the emitted turn', () async {
    await f.cubit.prepareSession(wsId: 'ws');
    final old = f.send(text: 'Old invocation');
    final current = f.send(text: 'Current invocation');
    expect(await old, AssistantLiveDispatch.stale);
    expect(await current, AssistantLiveDispatch.dispatched);
    expect(f.wire.texts, ['Current invocation']);
    expect(f.cubit.state.userDraft, 'Current invocation');
  });

  for (final closed in [false, true]) {
    test(
      'connected Cubit refuses a ${closed ? 'closed' : 'missing'} sink',
      () async {
        await f.cubit.prepareSession(wsId: 'ws');
        if (closed) {
          f.wire.closeCode = 1000;
        } else {
          await f.wire.socket.disconnect();
        }
        expect(await f.send(), AssistantLiveDispatch.refused);
        expect(f.wire.textAttempts, 0);
        expect(f.cubit.state.userDraft, isEmpty);
      },
    );
  }

  test(
    'file failure before dispatch refuses without a visible sent turn',
    () async {
      await f.cubit.prepareSession(wsId: 'ws');
      final file = _File();
      when(
        file.readAsBytes,
      ).thenThrow(const FileSystemException('Synthetic read'));
      await IOOverrides.runZoned(() async {
        expect(
          await f.send(attachments: [_image]),
          AssistantLiveDispatch.refused,
        );
        expect(f.wire.textAttempts, 0);
        expect(f.cubit.state.userDraft, isEmpty);
      }, createFile: (_) => file);
    },
  );

  test(
    'throw after possible text admission is unknown and never replayed',
    () async {
      f.wire.throwAfterTextAdd = true;
      expect(await f.send(), AssistantLiveDispatch.unknown);
      expect(f.wire.textAttempts, 1);
      expect(f.wire.texts, ['Captured question']);
      await Future<void>.delayed(Duration.zero);
      expect(f.wire.textAttempts, 1);
    },
  );

  test(
    'image admission followed by a throwing text add stays unknown',
    () async {
      await f.cubit.prepareSession(wsId: 'ws');
      final file = _File();
      when(file.readAsBytes).thenAnswer(
        (_) async =>
            Uint8List.fromList(img.encodePng(img.Image(width: 1, height: 1))),
      );
      f.wire.throwAfterTextAdd = true;
      await IOOverrides.runZoned(() async {
        expect(
          await f.send(attachments: [_image]),
          AssistantLiveDispatch.unknown,
        );
        final inputs = f.wire.admitted
            .map((frame) => frame['realtimeInput'])
            .whereType<Map<String, dynamic>>()
            .toList();
        expect(inputs.length, 2);
        expect(inputs.first['video'], isNotNull);
        expect(inputs.last['text'], contains('Captured question'));
        expect(f.wire.textAttempts, 1);
      }, createFile: (_) => file);
    },
  );

  test('stale scope after possible sink dispatch stays unknown', () async {
    await f.cubit.prepareSession(wsId: 'ws');
    f.wire.beforeText = () => f.scope++;
    expect(await f.send(), AssistantLiveDispatch.unknown);
    expect(f.wire.textAttempts, 1);
    expect(f.cubit.state.userDraft, isEmpty);
  });
}
