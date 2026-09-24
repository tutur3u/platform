import 'dart:async';
import 'dart:typed_data';

import 'package:flutter_pcm_sound/flutter_pcm_sound.dart';

class AssistantLiveAudioPlayer {
  bool _isInitialized = false;
  bool _disposed = false;
  int _generation = 0;
  Future<void> _pending = Future<void>.value();

  Future<void> _enqueue(Future<void> Function() operation) {
    final result = _pending.then((_) => operation());
    // Report failures to the caller without poisoning the remaining queue.
    _pending = result.then<void>((_) {}, onError: (Object _, StackTrace _) {});
    return result;
  }

  Future<void> _initialize() async {
    if (_isInitialized || _disposed) return;
    await FlutterPcmSound.setup(
      sampleRate: 24000,
      channelCount: 1,
      iosAudioCategory: IosAudioCategory.playAndRecord,
    );
    await FlutterPcmSound.setFeedThreshold(-1);
    _isInitialized = true;
  }

  Future<void> initialize() => _enqueue(_initialize);

  Future<void> play(Uint8List bytes) {
    if (bytes.isEmpty || _disposed) return Future<void>.value();
    final generation = _generation;
    // The plugin feeds the entire backing buffer, so normalize sublist views.
    final samples = Uint8List.fromList(bytes);
    return _enqueue(() async {
      if (_disposed || generation != _generation) return;
      await _initialize();
      await FlutterPcmSound.feed(
        PcmArrayInt16(bytes: samples.buffer.asByteData()),
      );
    });
  }

  Future<void> clear() {
    _generation++;
    return _enqueue(() async {
      if (!_isInitialized || _disposed) return;
      await FlutterPcmSound.release();
      _isInitialized = false;
      await _initialize();
    });
  }

  /// Release the audio session until the next frame needs playback.
  Future<void> pause() {
    _generation++;
    return _enqueue(() async {
      if (!_isInitialized || _disposed) return;
      await FlutterPcmSound.release();
      _isInitialized = false;
    });
  }

  Future<void> dispose() {
    _disposed = true;
    _generation++;
    return _enqueue(() async {
      if (!_isInitialized) return;
      await FlutterPcmSound.release();
      _isInitialized = false;
    });
  }
}
