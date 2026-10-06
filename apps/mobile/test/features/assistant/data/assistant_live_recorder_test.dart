import 'dart:typed_data';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/data/assistant_live_recorder.dart';
import 'package:record/record.dart';

class _RecordingPlatform extends RecordPlatform {
  RecordConfig? config;
  bool recording = false;
  @override
  Future<void> create(String recorderId) async {}
  @override
  Stream<RecordState> onStateChanged(String recorderId) => const Stream.empty();
  @override
  Future<Stream<Uint8List>> startStream(
    String recorderId,
    RecordConfig config,
  ) async {
    this.config = config;
    recording = true;
    return const Stream.empty();
  }

  @override
  Future<bool> isRecording(String recorderId) async => recording;
  @override
  Future<String?> stop(String recorderId) async {
    recording = false;
    return null;
  }

  @override
  Future<void> dispose(String recorderId) async {}
  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  test(
    'actual recorder requests communication audio and releases capture',
    () async {
      final previous = RecordPlatform.instance;
      final platform = _RecordingPlatform();
      RecordPlatform.instance = platform;
      addTearDown(() => RecordPlatform.instance = previous);
      final recorder = AssistantLiveRecorder();
      await recorder.start(onData: (_) {});
      final config = platform.config!;
      expect(config.encoder, AudioEncoder.pcm16bits);
      expect(config.sampleRate, 16000);
      expect(
        config.echoCancel && config.noiseSuppress && config.autoGain,
        isTrue,
      );
      expect(
        config.androidConfig.audioSource,
        AndroidAudioSource.voiceCommunication,
      );
      expect(
        config.androidConfig.audioManagerMode,
        AudioManagerMode.modeInCommunication,
      );
      expect(config.androidConfig.speakerphone, isTrue);
      await recorder.stop();
      expect(platform.recording, isFalse);
      await recorder.dispose();
    },
  );
}
