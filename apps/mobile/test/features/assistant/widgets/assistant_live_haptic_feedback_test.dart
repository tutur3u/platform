import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/interaction/app_haptics.dart';
import 'package:mobile/features/assistant/cubit/assistant_live_cubit.dart';
import 'package:mobile/features/assistant/models/assistant_live_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_live_haptic_feedback.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const scope = ('actor-a', 1, 'workspace-a');
  late AssistantLiveHapticFeedback feedback;
  late List<String> cues;

  void emit(
    AssistantLiveConnectionStatus status, {
    Object actorScope = scope,
    String workspace = 'workspace-a',
    bool active = true,
  }) {
    feedback.observe(
      AssistantLiveState(status: status, workspaceId: workspace),
      scope: actorScope,
      isActive: active,
    );
  }

  setUp(() {
    cues = [];
    feedback = AssistantLiveHapticFeedback(
      onSuccess: () async => cues.add('success'),
      onWarning: () async => cues.add('warning'),
    );
  });
  tearDown(() => feedback.dispose());

  test('one success after an active prepare/connect attempt', () {
    emit(AssistantLiveConnectionStatus.preparing);
    emit(AssistantLiveConnectionStatus.connecting);
    emit(AssistantLiveConnectionStatus.connected);
    expect(cues, ['success']);
  });

  test('one warning after an active connection fails', () {
    emit(AssistantLiveConnectionStatus.preparing);
    emit(AssistantLiveConnectionStatus.error);
    emit(AssistantLiveConnectionStatus.error);
    expect(cues, ['warning']);
  });

  test('restored connected and error snapshots stay silent', () {
    emit(AssistantLiveConnectionStatus.connected);
    emit(AssistantLiveConnectionStatus.error);
    expect(cues, isEmpty);
  });

  test('rebuilds and transcript/audio state updates never repeat cues', () {
    emit(AssistantLiveConnectionStatus.connecting);
    emit(AssistantLiveConnectionStatus.connecting);
    emit(AssistantLiveConnectionStatus.connected);
    feedback.observe(
      const AssistantLiveState(
        status: AssistantLiveConnectionStatus.connected,
        workspaceId: 'workspace-a',
        assistantDraft: 'A new transcript',
        audioLevel: 0.5,
      ),
      scope: scope,
      isActive: true,
    );
    emit(AssistantLiveConnectionStatus.connected);
    expect(cues, ['success']);
  });

  test('an actor replacement cannot finish the old attempt', () {
    emit(AssistantLiveConnectionStatus.connecting);
    emit(
      AssistantLiveConnectionStatus.connected,
      actorScope: ('actor-b', 2, 'workspace-a'),
    );
    expect(cues, isEmpty);
  });

  test('same actor returning after A-B-A requires a new epoch', () {
    emit(AssistantLiveConnectionStatus.connecting);
    emit(
      AssistantLiveConnectionStatus.connected,
      actorScope: ('actor-a', 3, 'workspace-a'),
    );
    expect(cues, isEmpty);
  });

  test('a different workspace outcome cannot finish the attempt', () {
    emit(AssistantLiveConnectionStatus.connecting);
    emit(AssistantLiveConnectionStatus.connected, workspace: 'workspace-b');
    expect(cues, isEmpty);
  });

  test(
    'background or hidden outcome is silent and cannot replay on resume',
    () {
      emit(AssistantLiveConnectionStatus.connecting);
      emit(AssistantLiveConnectionStatus.connected, active: false);
      emit(AssistantLiveConnectionStatus.connected);
      expect(cues, isEmpty);
    },
  );

  test('a background connecting attempt cannot finish after resuming', () {
    emit(AssistantLiveConnectionStatus.connecting, active: false);
    emit(AssistantLiveConnectionStatus.connecting);
    emit(AssistantLiveConnectionStatus.connected);
    expect(cues, isEmpty);
  });

  test('lifecycle suspension cancels an attempt without a state update', () {
    emit(AssistantLiveConnectionStatus.connecting);
    feedback.suspend();
    emit(AssistantLiveConnectionStatus.connecting);
    emit(AssistantLiveConnectionStatus.connected);
    expect(cues, isEmpty);
  });

  test('leaving and returning to live chrome cancels the pending cue', () {
    emit(AssistantLiveConnectionStatus.connecting);
    feedback
      ..onLiveModeChanged(isLiveMode: false)
      ..onLiveModeChanged(isLiveMode: true);
    emit(AssistantLiveConnectionStatus.connected);
    expect(cues, isEmpty);
  });

  test('entering live chrome permits a fresh attempt', () {
    feedback
      ..onLiveModeChanged(isLiveMode: false)
      ..onLiveModeChanged(isLiveMode: true);
    emit(AssistantLiveConnectionStatus.connecting);
    emit(AssistantLiveConnectionStatus.connected);
    expect(cues, ['success']);
  });

  test('disconnect cancels an attempt without a cue', () {
    emit(AssistantLiveConnectionStatus.connecting);
    emit(AssistantLiveConnectionStatus.disconnected);
    emit(AssistantLiveConnectionStatus.connected);
    expect(cues, isEmpty);
  });

  test('disposed feedback cannot emit a pending outcome', () {
    emit(AssistantLiveConnectionStatus.connecting);
    feedback.dispose();
    emit(AssistantLiveConnectionStatus.connected);
    expect(cues, isEmpty);
  });

  test('a later reconnect is a new attempt with one outcome', () {
    emit(AssistantLiveConnectionStatus.connecting);
    emit(AssistantLiveConnectionStatus.connected);
    emit(AssistantLiveConnectionStatus.reconnecting);
    emit(AssistantLiveConnectionStatus.connected);
    expect(cues, ['success', 'success']);
  });

  group('existing native policy', () {
    late List<MethodCall> calls;
    setUp(() async {
      await Future<void>.delayed(const Duration(milliseconds: 80));
      calls = [];
      feedback = AssistantLiveHapticFeedback();
      AppHaptics.enabled = true;
      debugDefaultTargetPlatformOverride = TargetPlatform.iOS;
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(SystemChannels.platform, (call) async {
            calls.add(call);
            return null;
          });
    });
    tearDown(() {
      AppHaptics.enabled = true;
      debugDefaultTargetPlatformOverride = null;
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
          .setMockMethodCallHandler(SystemChannels.platform, null);
    });

    test('disabled preference suppresses both outcome intents', () async {
      AppHaptics.enabled = false;
      emit(AssistantLiveConnectionStatus.connecting);
      emit(AssistantLiveConnectionStatus.connected);
      emit(AssistantLiveConnectionStatus.reconnecting);
      emit(AssistantLiveConnectionStatus.error);
      await Future<void>.delayed(Duration.zero);
      expect(calls, isEmpty);
    });

    test('unsupported system platform has no native haptic call', () async {
      debugDefaultTargetPlatformOverride = TargetPlatform.linux;
      emit(AssistantLiveConnectionStatus.connecting);
      emit(AssistantLiveConnectionStatus.connected);
      await Future<void>.delayed(Duration.zero);
      expect(calls, isEmpty);
    });

    test('success uses the existing system haptic intent', () async {
      emit(AssistantLiveConnectionStatus.connecting);
      emit(AssistantLiveConnectionStatus.connected);
      await Future<void>.delayed(Duration.zero);
      expect(calls.single.method, 'HapticFeedback.vibrate');
      expect(calls.single.arguments, 'HapticFeedbackType.mediumImpact');
    });

    test(
      'native platform denial cannot break the connection transition',
      () async {
        TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
            .setMockMethodCallHandler(SystemChannels.platform, (call) async {
              calls.add(call);
              throw PlatformException(code: 'haptic_denied');
            });
        emit(AssistantLiveConnectionStatus.connecting);
        emit(AssistantLiveConnectionStatus.error);
        await Future<void>.delayed(Duration.zero);
        expect(calls.single.arguments, 'HapticFeedbackType.heavyImpact');
      },
    );
  });
}
