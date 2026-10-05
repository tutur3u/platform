import 'package:mobile/features/assistant/cubit/assistant_voice_capture_cubit.dart';
import 'package:record/record.dart';

/// This encoder matches the server's verified PCM16/16kHz/mono contract.
class NotesVoiceRecorder implements AssistantVoiceRecorder {
  final AudioRecorder _recorder = AudioRecorder();
  @override
  Future<bool> hasPermission() => _recorder.hasPermission();
  @override
  Future<void> start(String path) => _recorder.start(
    const RecordConfig(
      encoder: AudioEncoder.wav,
      sampleRate: 16000,
      numChannels: 1,
    ),
    path: path,
  );
  @override
  Future<void> pause() => _recorder.pause();
  @override
  Future<void> resume() => _recorder.resume();
  @override
  Future<void> stop() async {
    await _recorder.stop();
  }

  @override
  Stream<double> get levels => _recorder
      .onAmplitudeChanged(const Duration(milliseconds: 80))
      .map((level) => ((level.current + 60) / 60).clamp(0.0, 1.0));
  @override
  Future<void> dispose() => _recorder.dispose();
}
