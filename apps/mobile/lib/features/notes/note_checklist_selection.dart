import 'package:flutter_quill/flutter_quill.dart';

class NoteChecklistSelection {
  const NoteChecklistSelection({
    required this.start,
    required this.length,
    required this.text,
  });

  final int start;
  final int length;
  final String text;
}

NoteChecklistSelection? selectedChecklistItem(QuillController controller) {
  final cursor = controller.selection.baseOffset;
  if (cursor < 0) return null;

  var offset = 0;
  var lineStart = 0;
  final text = StringBuffer();
  for (final operation in controller.document.toDelta().toList()) {
    final data = operation.data;
    if (data is! String) {
      offset++;
      continue;
    }
    for (final character in data.split('')) {
      if (character == '\n') {
        final list = operation.attributes?['list'];
        if (cursor >= lineStart &&
            cursor <= offset &&
            (list == 'checked' || list == 'unchecked')) {
          final value = text.toString().trim();
          if (value.isEmpty) return null;
          return NoteChecklistSelection(
            start: lineStart,
            length: offset - lineStart,
            text: value,
          );
        }
        text.clear();
        lineStart = offset + 1;
      } else {
        text.write(character);
      }
      offset++;
    }
  }
  return null;
}
