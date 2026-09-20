import 'dart:collection';
import 'dart:typed_data';

/// Bounded, memory-only PCM queue. Keeps the beginning of an utterance intact.
/// The caller stops capture on overflow rather than silently dropping words.
class AssistantAudioBuffer {
  AssistantAudioBuffer({this.maxBytes = 16000 * 2 * 30});

  final int maxBytes;
  final Queue<Uint8List> _chunks = Queue();
  int _length = 0;

  bool get isEmpty => _chunks.isEmpty;

  bool add(Uint8List bytes) {
    if (_length + bytes.length > maxBytes) return false;
    if (bytes.isNotEmpty) {
      _chunks.add(Uint8List.fromList(bytes));
      _length += bytes.length;
    }
    return true;
  }

  Uint8List? take() {
    if (_chunks.isEmpty) return null;
    final chunk = _chunks.removeFirst();
    _length -= chunk.length;
    return chunk;
  }

  void clear() {
    _chunks.clear();
    _length = 0;
  }
}
