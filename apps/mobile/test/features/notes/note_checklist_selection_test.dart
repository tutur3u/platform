import 'package:flutter/material.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/notes/note_checklist_selection.dart';

void main() {
  test('selects the current checklist item and ignores ordinary text', () {
    final controller = QuillController(
      document: Document.fromJson(const [
        {'insert': 'Before\n'},
        {'insert': 'Buy supplies'},
        {
          'insert': '\n',
          'attributes': {'list': 'unchecked'},
        },
        {'insert': 'After\n'},
      ]),
      selection: const TextSelection.collapsed(offset: 10),
    );

    final item = selectedChecklistItem(controller);
    expect(item?.text, 'Buy supplies');
    expect(item?.start, 7);
    expect(item?.length, 12);

    controller.updateSelection(
      const TextSelection.collapsed(offset: 2),
      ChangeSource.local,
    );
    expect(selectedChecklistItem(controller), isNull);
    controller.dispose();
  });
}
