import 'dart:typed_data';

import 'package:flutter_pcm_sound/flutter_pcm_sound.dart';

class AssistantLiveAudioPlayer {
  bool _isInitialized = false;

  Future<void> initialize() async {
    if (_isInitialized) return;
    await FlutterPcmSound.setup(
      sampleRate: 24000,
      channelCount: 1,
      iosAudioCategory: IosAudioCategory.playAndRecord,
    );
    await FlutterPcmSound.setFeedThreshold(-1);
    _isInitialized = true;
  }

  Future<void> play(Uint8List bytes) async {
    if (bytes.isEmpty) return;
    await initialize();
    await FlutterPcmSound.feed(
      PcmArrayInt16(
        bytes: bytes.buffer.asByteData(
          bytes.offsetInBytes,
          bytes.lengthInBytes,
        ),
      ),
    );
  }

  Future<void> clear() async {
    if (!_isInitialized) return;
    await FlutterPcmSound.release();
    _isInitialized = false;
    await initialize();
  }

  Future<void> dispose() async {
    if (!_isInitialized) return;
    await FlutterPcmSound.release();
    _isInitialized = false;
  }
}
