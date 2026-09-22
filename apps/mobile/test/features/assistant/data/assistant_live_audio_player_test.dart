import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/data/assistant_live_audio_player.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel('flutter_pcm_sound/methods');
  final messenger =
      TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger;
  tearDown(() => messenger.setMockMethodCallHandler(channel, null));

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
    expect(calls, ['setup']);
    setup.complete();
    await Future.wait([starting, duplicate, first, second]);
    expect(calls, ['setup', 'setFeedThreshold', 'feed', 'feed']);
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
}
