import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/assistant/data/assistant_audio_buffer.dart';

void main() {
  test('startup audio preserves order and owns its bytes', () {
    final buffer = AssistantAudioBuffer(maxBytes: 8);
    final input = Uint8List.fromList([1, 2]);
    expect(buffer.add(input), isTrue);
    input[0] = 9;
    expect(buffer.add(Uint8List.fromList([3, 4])), isTrue);
    expect(buffer.take(), [1, 2]);
    expect(buffer.take(), [3, 4]);
    expect(buffer.take(), isNull);
  });

  test('overflow preserves opening words and cancellation discards audio', () {
    final buffer = AssistantAudioBuffer(maxBytes: 2);
    expect(buffer.add(Uint8List.fromList([1, 2])), isTrue);
    expect(buffer.add(Uint8List.fromList([3])), isFalse);
    expect(buffer.take(), [1, 2]);
    expect(buffer.add(Uint8List.fromList([4])), isTrue);
    buffer.clear();
    expect(buffer.isEmpty, isTrue);
    expect(buffer.take(), isNull);
    expect(buffer.add(Uint8List.fromList([5, 6])), isTrue);
  });
}
