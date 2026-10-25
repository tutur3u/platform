import 'dart:async';
import 'dart:typed_data';

import 'package:record/record.dart';

class AssistantLiveRecorder {
  final AudioRecorder _recorder = AudioRecorder();
  StreamSubscription<Uint8List>? _streamSubscription;
  StreamSubscription<Amplitude>? _amplitudeSubscription;
  Future<void> _captureOperation = Future<void>.value();
  bool _ownsCapture = false;
  bool _disposed = false;
  int _generation = 0;

  Future<bool> ensurePermission() async {
    if (_disposed) return false;
    final generation = _generation;
    final granted = await _recorder.hasPermission();
    return granted && !_disposed && generation == _generation;
  }

  Future<void> start({
    required void Function(Uint8List bytes) onData,
    void Function(double level)? onAmplitude,
    void Function(Object error)? onError,
  }) {
    final generation = _generation;
    bool isCurrent() => !_disposed && generation == _generation;

    return _serializeCapture(() async {
      if (!isCurrent()) return;
      await _stopCapture();
      if (!isCurrent()) return;
      // Ownership begins before the native await, including partial failures.
      _ownsCapture = true;
      final stream = await _recorder.startStream(
        const RecordConfig(
          encoder: AudioEncoder.pcm16bits,
          sampleRate: 16000,
          numChannels: 1,
          autoGain: true,
          echoCancel: true,
          noiseSuppress: true,
          streamBufferSize: 2048,
          androidConfig: AndroidRecordConfig(
            audioSource: AndroidAudioSource.voiceCommunication,
            audioManagerMode: AudioManagerMode.modeInCommunication,
            speakerphone: true,
          ),
        ),
      );
      if (!isCurrent()) return;

      void handleError(Object error) {
        if (isCurrent()) onError?.call(error);
      }

      _streamSubscription = stream.listen((bytes) {
        if (isCurrent()) onData(bytes);
      }, onError: onError == null ? null : handleError);

      if (onAmplitude != null) {
        _amplitudeSubscription = _recorder
            .onAmplitudeChanged(const Duration(milliseconds: 120))
            .listen((value) {
              if (!isCurrent()) return;
              final normalized = ((value.current + 60) / 60).clamp(0.0, 1.0);
              onAmplitude(normalized);
            }, onError: onError == null ? null : handleError);
      }
    });
  }

  Future<void> stop() {
    _generation++;
    return _serializeCapture(_stopCapture);
  }

  Future<void> _serializeCapture(Future<void> Function() operation) {
    final next = _captureOperation.then((_) => operation());
    _captureOperation = next.then<void>(
      (_) {},
      onError: (Object _, StackTrace _) {},
    );
    return next;
  }

  Future<void> _stopCapture() async {
    await _streamSubscription?.cancel();
    _streamSubscription = null;
    await _amplitudeSubscription?.cancel();
    _amplitudeSubscription = null;
    // record serializes native queries behind permission dialogs too.
    if (_ownsCapture) {
      await _recorder.stop();
      _ownsCapture = false;
    }
  }

  Future<void> dispose() async {
    _disposed = true;
    await stop();
    await _serializeCapture(_recorder.dispose);
  }
}
