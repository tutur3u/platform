import 'dart:async';
import 'dart:io';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/cubit/assistant_voice_capture_cubit.dart';

class _Recorder implements AssistantVoiceRecorder {
  final amplitude = StreamController<double>.broadcast(sync: true);
  final paths = <String>[];
  Completer<bool>? permission;
  Completer<void>? stopping;
  Completer<void>? resuming;
  bool allowed = true;
  int pauses = 0;
  int resumes = 0;
  bool disposed = false;

  @override
  Future<bool> hasPermission() async => await permission?.future ?? allowed;
  @override
  Future<void> start(String path) async {
    paths.add(path);
    await File(path).writeAsBytes([1, 2, 3]);
  }

  @override
  Future<void> pause() async => pauses++;
  @override
  Future<void> resume() async {
    resumes++;
    await resuming?.future;
  }

  @override
  Future<void> stop() async {
    await stopping?.future;
  }

  @override
  Stream<double> get levels => amplitude.stream;
  @override
  Future<void> dispose() async {
    disposed = true;
    await amplitude.close();
  }
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();
  late Directory directory;
  late _Recorder recorder;
  late AssistantVoiceCaptureCubit capture;
  setUp(() async {
    directory = await Directory.systemTemp.createTemp('mira-capture-test-');
    recorder = _Recorder();
    capture = AssistantVoiceCaptureCubit(
      recorder: recorder,
      temporaryDirectory: () async => directory,
    );
  });
  tearDown(() async {
    await capture.close();
    await directory.delete(recursive: true);
  });

  test('WAV cannot label default AAC recording with a WAV extension', () {
    expect(
      () => AssistantVoiceCaptureCubit(
        fileExtension: 'wav',
        fileName: 'voice-note.wav',
      ),
      throwsArgumentError,
    );
  });

  test('amplitude stream failure stops and erases recording', () async {
    await capture.start();
    final failed = capture.stream.firstWhere(
      (state) => state.error == AssistantVoiceCaptureError.recording,
    );
    recorder.amplitude.addError(StateError('Native amplitude unavailable'));
    await failed;
    expect(File(recorder.paths.single).existsSync(), isFalse);
    expect(capture.state.visible, isFalse);
  });

  test(
    'scope cancellation during restart cannot begin another recording',
    () async {
      await capture.start();
      await capture.pause();
      recorder.stopping = Completer<void>();
      final restart = capture.restart();
      final cancel = capture.cancel();
      recorder.stopping!.complete();
      await Future.wait([restart, cancel]);
      expect(recorder.paths, hasLength(1));
      expect(capture.state.visible, isFalse);
    },
  );

  test(
    'injected WAV recorder preserves its actual extension and upload name',
    () async {
      await capture.close();
      recorder = _Recorder();
      capture = AssistantVoiceCaptureCubit(
        recorder: recorder,
        temporaryDirectory: () async => directory,
        fileExtension: 'wav',
        fileName: 'voice-note.wav',
      );
      await capture.start();
      expect(recorder.paths.single, endsWith('.wav'));
      await capture.pause();
      final file = await capture.takeRecording();
      expect(file?.name, 'voice-note.wav');
      expect(await file?.readAsBytes(), [1, 2, 3]);
    },
  );

  test('unused native capture never creates the microphone plugin', () async {
    final unused = AssistantVoiceCaptureCubit();
    await unused.cancel();
    await unused.close();
  });

  test(
    'overlapping cancellation serializes cleanup and erases the file',
    () async {
      await capture.start();
      await Future.wait([capture.cancel(), capture.cancel()]);
      expect(File(recorder.paths.single).existsSync(), isFalse);
      expect(capture.state.error, isNull);
    },
  );

  test('permission denial never starts native recording', () async {
    recorder.allowed = false;
    await capture.start();
    expect(recorder.paths, isEmpty);
    expect(capture.state.error, AssistantVoiceCaptureError.permission);
    expect(capture.state.visible, isFalse);
  });

  test(
    'pause/resume preserves local recording until explicit attachment',
    () async {
      await capture.start();
      final path = recorder.paths.single;
      await capture.pause();
      expect(capture.state.paused, isTrue);
      expect(File(path).existsSync(), isTrue);
      await capture.resume();
      expect(capture.state.recording, isTrue);
      expect(recorder.paths, [path]);
      await capture.pause();
      final file = await capture.takeRecording();
      expect(await file?.readAsBytes(), [1, 2, 3]);
      expect(File(path).existsSync(), isFalse);
      expect(capture.state.visible, isFalse);
    },
  );

  test(
    'restart erases only current unsent file and preserves other files',
    () async {
      final other = File('${directory.path}/other-recording.m4a');
      await other.writeAsBytes([9]);
      await capture.start();
      final previous = recorder.paths.single;
      await capture.pause();
      await capture.restart();
      expect(File(previous).existsSync(), isFalse);
      expect(recorder.paths.last, isNot(previous));
      expect(other.existsSync(), isTrue);
      expect(capture.state.recording, isTrue);
    },
  );

  test('cancel fences permission completion before native start', () async {
    recorder.permission = Completer<bool>();
    final start = capture.start();
    final cancel = capture.cancel();
    recorder.permission!.complete(true);
    await Future.wait([start, cancel]);
    expect(recorder.paths, isEmpty);
    expect(capture.state.visible, isFalse);
  });

  test(
    'scope cancellation during finish yields no attachment and erases file',
    () async {
      await capture.start();
      await capture.pause();
      recorder.stopping = Completer<void>();
      final take = capture.takeRecording();
      final cancel = capture.cancel();
      recorder.stopping!.complete();
      expect(await take, isNull);
      await cancel;
      expect(File(recorder.paths.single).existsSync(), isFalse);
    },
  );

  test(
    'background during pending resume pauses native capture again',
    () async {
      await capture.start();
      await capture.pause();
      recorder.resuming = Completer<void>();
      final resume = capture.resume();
      capture.didChangeAppLifecycleState(AppLifecycleState.inactive);
      recorder.resuming!.complete();
      await resume;
      expect(capture.state.paused, isTrue);
      expect(recorder.pauses, 2);
    },
  );

  test(
    'amplitude history is bounded and nonfinite levels cannot paint',
    () async {
      await capture.start();
      for (var i = 0; i < 40; i++) {
        recorder.amplitude.add(i.toDouble());
      }
      recorder.amplitude.add(double.nan);
      expect(capture.state.levels, hasLength(32));
      expect(capture.state.levels.last, 0);
      expect(
        capture.state.levels.every((level) => level >= 0 && level <= 1),
        isTrue,
      );
      await capture.pause();
      final frozen = capture.state.levels;
      recorder.amplitude.add(0.4);
      expect(capture.state.levels, same(frozen));
    },
  );
}
