import 'dart:async';
import 'dart:typed_data';

import 'package:flutter_pcm_sound/flutter_pcm_sound.dart';
import 'package:mobile/features/assistant/models/assistant_playback_spectrum.dart';

class AssistantLiveAudioPlayer {
  final _activity = StreamController<AssistantPlaybackSpectrum>.broadcast();
  Stream<AssistantPlaybackSpectrum>? get activity => _activity.stream;
  DateTime? _lastSpectrum;
  int _drainRevision = 0;
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
    // The plugin's standard logging includes raw PCM sample bytes.
    await FlutterPcmSound.setLogLevel(LogLevel.none);
    await FlutterPcmSound.setup(
      sampleRate: 24000,
      channelCount: 1,
      iosAudioCategory: IosAudioCategory.playAndRecord,
    );
    final generation = _generation;
    // Zero-buffer callbacks reset activity from native playback completion.
    FlutterPcmSound.setFeedCallback((remainingFrames) {
      if (remainingFrames == 0 && !_disposed && generation == _generation) {
        _drainRevision++;
        _activity.add(const AssistantPlaybackSpectrum());
      }
    });
    await FlutterPcmSound.setFeedThreshold(0);
    _isInitialized = true;
  }

  Future<void> initialize() => _enqueue(_initialize);

  Future<void> play(Uint8List bytes) {
    if (bytes.isEmpty || _disposed) return Future<void>.value();
    if (bytes.length.isOdd) {
      return Future<void>.error(const FormatException('Unaligned Live PCM'));
    }
    final generation = _generation;
    // The plugin feeds the entire backing buffer, so normalize sublist views.
    final samples = Uint8List.fromList(bytes);
    return _enqueue(() async {
      if (_disposed || generation != _generation) return;
      await _initialize();
      if (_disposed || generation != _generation) return;
      final drainRevision = _drainRevision;
      await FlutterPcmSound.feed(
        PcmArrayInt16(bytes: samples.buffer.asByteData()),
      );
      if (_disposed || generation != _generation) return;
      if (drainRevision != _drainRevision) return;
      final now = DateTime.now();
      if (_lastSpectrum == null ||
          now.difference(_lastSpectrum!) >= const Duration(milliseconds: 50)) {
        _lastSpectrum = now;
        _activity.add(AssistantPlaybackSpectrum.decode(samples));
      }
    });
  }

  Future<void> clear() {
    _generation++;
    _lastSpectrum = null;
    if (!_activity.isClosed) _activity.add(const AssistantPlaybackSpectrum());
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
    _lastSpectrum = null;
    if (!_activity.isClosed) _activity.add(const AssistantPlaybackSpectrum());
    return _enqueue(() async {
      if (!_isInitialized || _disposed) return;
      await FlutterPcmSound.release();
      _isInitialized = false;
    });
  }

  Future<void> dispose() {
    _disposed = true;
    _generation++;
    _lastSpectrum = null;
    if (!_activity.isClosed) _activity.add(const AssistantPlaybackSpectrum());
    return _enqueue(() async {
      if (_isInitialized) {
        await FlutterPcmSound.release();
        _isInitialized = false;
      }
      FlutterPcmSound.setFeedCallback(null);
      await _activity.close();
    });
  }
}
