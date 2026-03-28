import 'dart:async';
import 'dart:typed_data';

import 'package:record/record.dart';

class AssistantLiveRecorder {
  final AudioRecorder _recorder = AudioRecorder();
  StreamSubscription<Uint8List>? _streamSubscription;
  StreamSubscription<Amplitude>? _amplitudeSubscription;

  Future<bool> ensurePermission() {
    return _recorder.hasPermission();
  }

  Future<void> start({
    required void Function(Uint8List bytes) onData,
    void Function(double level)? onAmplitude,
  }) async {
    final stream = await _recorder.startStream(
      const RecordConfig(
        encoder: AudioEncoder.pcm16bits,
        sampleRate: 16000,
        numChannels: 1,
        autoGain: true,
        echoCancel: true,
        noiseSuppress: true,
        streamBufferSize: 2048,
      ),
    );

    await _streamSubscription?.cancel();
    _streamSubscription = stream.listen(onData);

    await _amplitudeSubscription?.cancel();
    if (onAmplitude != null) {
      _amplitudeSubscription = _recorder
          .onAmplitudeChanged(const Duration(milliseconds: 120))
          .listen((value) {
            final normalized = ((value.current + 60) / 60).clamp(0.0, 1.0);
            onAmplitude(normalized);
          });
    }
  }

  Future<void> stop() async {
    await _streamSubscription?.cancel();
    _streamSubscription = null;
    await _amplitudeSubscription?.cancel();
    _amplitudeSubscription = null;
    if (await _recorder.isRecording()) {
      await _recorder.stop();
    }
  }

  Future<void> dispose() async {
    await stop();
    await _recorder.dispose();
  }
}
