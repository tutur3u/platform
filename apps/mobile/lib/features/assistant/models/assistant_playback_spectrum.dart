import 'dart:math' as math;
import 'dart:typed_data';

/// Spectrum of the signed, little-endian PCM frames admitted to playback.
class AssistantPlaybackSpectrum {
  const AssistantPlaybackSpectrum({
    this.energy = 0,
    this.bands = const [0, 0, 0],
    this.frames = 0,
    this.sampleRate = 24000,
  });

  factory AssistantPlaybackSpectrum.decode(
    Uint8List bytes, {
    int sampleRate = 24000,
    int channels = 1,
  }) {
    if (sampleRate != 24000 || channels != 1 || bytes.length.isOdd) {
      throw const FormatException('Unsupported Live PCM format');
    }
    if (bytes.isEmpty) return const AssistantPlaybackSpectrum();
    final data = ByteData.sublistView(bytes);
    final frames = bytes.length ~/ 2;
    // Bound transform work independently of provider chunk size. The latest
    // contiguous window retains the true sample rate (no decimation aliasing).
    final count = math.min(frames, 512);
    final start = frames - count;
    final samples = List<double>.generate(
      count,
      (index) => data.getInt16((start + index) * 2, Endian.little) / 32768,
    );
    var squares = 0.0;
    for (final sample in samples) {
      squares += sample * sample;
    }
    final power = [0.0, 0.0, 0.0];
    for (var bin = 1; bin <= count ~/ 2; bin++) {
      final frequency = bin * sampleRate / count;
      if (frequency > 6000) break;
      var real = 0.0;
      var imaginary = 0.0;
      for (var index = 0; index < count; index++) {
        final angle = 2 * math.pi * bin * index / count;
        final window = count == 1
            ? 1.0
            : .5 - .5 * math.cos(2 * math.pi * index / (count - 1));
        real += samples[index] * window * math.cos(angle);
        imaginary -= samples[index] * window * math.sin(angle);
      }
      final band = frequency < 400 ? 0 : (frequency < 1800 ? 1 : 2);
      power[band] += (real * real + imaginary * imaginary) / (count * count);
    }
    return AssistantPlaybackSpectrum(
      energy: math.sqrt(squares / count).clamp(0, 1),
      bands: List.unmodifiable(power.map((value) => math.sqrt(value) * 4)),
      frames: frames,
      sampleRate: sampleRate,
    );
  }
  final double energy;
  final List<double> bands;
  final int frames;
  final int sampleRate;
}
