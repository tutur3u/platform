import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter_pcm_sound/flutter_pcm_sound.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/data/assistant_live_audio_player.dart';
import 'package:mobile/features/assistant/models/assistant_playback_spectrum.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel('flutter_pcm_sound/methods');
  final messenger =
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
  tearDown(() => messenger.setMockMethodCallHandler(channel, null));

  test(
    'activity follows admitted PCM and native buffer completion, not receipt',
    () async {
      final feeding = Completer<void>();
      messenger.setMockMethodCallHandler(channel, (call) async {
        if (call.method == 'feed') await feeding.future;
        return true;
      });
      final player = AssistantLiveAudioPlayer();
      final activity = <AssistantPlaybackSpectrum>[];
      final subscription = player.activity!.listen(activity.add);
      final frame = player.play(Uint8List.fromList([0, 64, 0, 64]));
      await Future<void>.delayed(Duration.zero);
      expect(activity, isEmpty);
      feeding.complete();
      await frame;
      await Future<void>.delayed(Duration.zero);
      expect(activity.single.energy, .5);
      FlutterPcmSound.onFeedSamplesCallback!(0);
      await Future<void>.delayed(Duration.zero);
      expect(activity.last.energy, 0);
      await player.pause();
      await player.dispose();
      await subscription.cancel();
    },
  );

  test(
    'native drained callback before feed receipt cannot revive speaking',
    () async {
      messenger.setMockMethodCallHandler(channel, (call) async {
        if (call.method == 'feed') FlutterPcmSound.onFeedSamplesCallback!(0);
        return true;
      });
      final player = AssistantLiveAudioPlayer();
      final activity = <AssistantPlaybackSpectrum>[];
      final subscription = player.activity!.listen(activity.add);
      await player.play(Uint8List.fromList([0, 64]));
      await Future<void>.delayed(Duration.zero);
      expect(activity.map((frame) => frame.energy), everyElement(0));
      await player.dispose();
      await subscription.cancel();
    },
  );

  test('rejected playback emits no fabricated spectrum', () async {
    messenger.setMockMethodCallHandler(channel, (call) async {
      if (call.method == 'feed') throw PlatformException(code: 'unavailable');
      return true;
    });
    final player = AssistantLiveAudioPlayer();
    final activity = <AssistantPlaybackSpectrum>[];
    final subscription = player.activity!.listen(activity.add);
    await expectLater(
      player.play(Uint8List.fromList([0, 64])),
      throwsA(isA<PlatformException>()),
    );
    expect(activity, isEmpty);
    await player.dispose();
    await subscription.cancel();
  });

  test(
    'native PCM logging is disabled before setup or sensitive feed',
    () async {
      final calls = <MethodCall>[];
      messenger.setMockMethodCallHandler(channel, (call) async {
        calls.add(call);
        return true;
      });
      final player = AssistantLiveAudioPlayer();
      await player.play(Uint8List.fromList([0, 64]));
      expect(calls.first.method, 'setLogLevel');
      expect(calls.first.arguments, {'log_level': LogLevel.none.index});
      expect(calls.map((call) => call.method), [
        'setLogLevel',
        'setup',
        'setFeedThreshold',
        'feed',
      ]);
      await player.dispose();
    },
  );

  test('serializes startup and feeds only the PCM slice', () async {
    final setup = Completer<void>();
    final calls = <String>[];
    final frames = <List<int>>[];
    messenger.setMockMethodCallHandler(channel, (call) async {
      calls.add(call.method);
      if (call.method == 'setup') await setup.future;
      if (call.method == 'feed') {
        frames.add((call.arguments as Map)['buffer'] as Uint8List);
      }
      return true;
    });
    final player = AssistantLiveAudioPlayer();
    final starting = player.initialize();
    final duplicate = player.initialize();
    final backing = Uint8List.fromList([99, 99, 1, 2, 3, 4, 88, 88]);
    final first = player.play(Uint8List.sublistView(backing, 2, 6));
    final second = player.play(Uint8List.fromList([5, 6]));
    await Future<void>.delayed(Duration.zero);
    expect(calls, ['setLogLevel', 'setup']);
    setup.complete();
    await Future.wait([starting, duplicate, first, second]);
    expect(calls, ['setLogLevel', 'setup', 'setFeedThreshold', 'feed', 'feed']);
    expect(frames, [
      [1, 2, 3, 4],
      [5, 6],
    ]);
    await player.dispose();
  });

  test('interruption drops queued audio and cleanup is terminal', () async {
    final setup = Completer<void>();
    final calls = <String>[];
    messenger.setMockMethodCallHandler(channel, (call) async {
      calls.add(call.method);
      if (call.method == 'setup') await setup.future;
      return true;
    });
    final player = AssistantLiveAudioPlayer();
    final starting = player.initialize();
    await Future<void>.delayed(Duration.zero);
    final frame = player.play(Uint8List.fromList([1, 2]));
    final clear = player.clear();
    final dispose = player.dispose();
    setup.complete();
    await Future.wait([starting, frame, clear, dispose]);
    await player.play(Uint8List.fromList([3, 4]));
    expect(calls.where((call) => call == 'feed'), isEmpty);
    expect(calls.last, 'release');
    expect(calls.where((call) => call == 'setup'), hasLength(1));
  });

  test(
    'pause releases the audio session until a later frame arrives',
    () async {
      final calls = <String>[];
      messenger.setMockMethodCallHandler(channel, (call) async {
        calls.add(call.method);
        return true;
      });
      final player = AssistantLiveAudioPlayer();
      await player.initialize();
      await player.pause();
      expect(calls, ['setLogLevel', 'setup', 'setFeedThreshold', 'release']);
      await player.play(Uint8List.fromList([1, 0]));
      expect(calls, [
        'setLogLevel',
        'setup',
        'setFeedThreshold',
        'release',
        'setLogLevel',
        'setup',
        'setFeedThreshold',
        'feed',
      ]);
      await player.dispose();
    },
  );
  for (final terminal in ['pause', 'dispose']) {
    test('$terminal during first-frame setup prevents stale feed', () async {
      final setup = Completer<void>();
      final calls = <String>[];
      messenger.setMockMethodCallHandler(channel, (call) async {
        calls.add(call.method);
        if (call.method == 'setup') await setup.future;
        return true;
      });
      final player = AssistantLiveAudioPlayer();
      final frame = player.play(Uint8List.fromList([1, 0]));
      await Future<void>.delayed(Duration.zero);
      final stopping = terminal == 'pause' ? player.pause() : player.dispose();
      setup.complete();
      await Future.wait([frame, stopping]);
      expect(calls.where((call) => call == 'feed'), isEmpty);
      expect(calls.last, 'release');
      if (terminal == 'pause') {
        await player.play(Uint8List.fromList([2, 0]));
        expect(calls.where((call) => call == 'feed'), hasLength(1));
        await player.dispose();
      }
    });
  }
}
