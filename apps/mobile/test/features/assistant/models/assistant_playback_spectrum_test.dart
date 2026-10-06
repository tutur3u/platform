import 'dart:math' as math;
import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/models/assistant_playback_spectrum.dart';

Uint8List tone(double frequency, {double amplitude = .5}) {
  final data = ByteData(1024);
  for (var index = 0; index < 512; index++) {
    data.setInt16(
      index * 2,
      (32767 * amplitude * math.sin(2 * math.pi * frequency * index / 24000))
          .round(),
      Endian.little,
    );
  }
  return data.buffer.asUint8List();
}

void main() {
  test('silence has no fabricated energy or spectrum', () {
    final result = AssistantPlaybackSpectrum.decode(Uint8List(1024));
    expect(result.energy, 0);
    expect(result.bands, [0, 0, 0]);
  });

  for (final (frequency, band) in [(187.5, 0), (937.5, 1), (3000.0, 2)]) {
    test('actual $frequency Hz PCM dominates band $band', () {
      final result = AssistantPlaybackSpectrum.decode(tone(frequency));
      expect(result.energy, closeTo(.5 / math.sqrt(2), .002));
      expect(result.bands[band], greaterThan(.3));
      for (var other = 0; other < 3; other++) {
        if (other != band) expect(result.bands[other], lessThan(.01));
      }
    });
  }

  test('little endian signed samples and sublist offsets are respected', () {
    final source = Uint8List.fromList([9, 9, 0, 128, 255, 127, 9, 9]);
    final result = AssistantPlaybackSpectrum.decode(
      Uint8List.sublistView(source, 2, 6),
    );
    expect(result.frames, 2);
    expect(result.energy, closeTo(1, .0001));
  });

  test('unaligned frames and unsupported metadata are rejected', () {
    expect(
      () => AssistantPlaybackSpectrum.decode(Uint8List(3)),
      throwsFormatException,
    );
    expect(
      () => AssistantPlaybackSpectrum.decode(tone(100), sampleRate: 16000),
      throwsFormatException,
    );
    expect(
      () => AssistantPlaybackSpectrum.decode(tone(100), channels: 2),
      throwsFormatException,
    );
  });
}
