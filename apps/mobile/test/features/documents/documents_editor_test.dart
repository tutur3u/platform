import 'package:flutter/material.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/features/documents/documents_content.dart';
import 'package:mobile/features/documents/documents_labels.dart';
import 'package:mobile/features/documents/view/document_editor.dart';
import 'package:mobile/features/documents/view/document_share_sheet.dart';

import '../../helpers/helpers.dart';

void main() {
  setUpAll(() async {
    await initializeDateFormatting('en');
  });

  test('untitled names use the edited date', () {
    expect(documentNameIsUntitled(''), isTrue);
    expect(documentNameIsUntitled('Untitled document'), isTrue);
    expect(documentNameIsUntitled('Chưa đặt tên'), isTrue);
    expect(documentNameIsUntitled('Roadmap'), isFalse);
    expect(
      documentDisplayTitle(
        name: '',
        untitled: 'Untitled',
        editedAt: DateTime(2026, 11, 19, 12),
        locale: 'en',
      ),
      'Untitled · Nov 19',
    );
    expect(
      documentDisplayTitle(
        name: 'Roadmap',
        untitled: 'Untitled',
        editedAt: DateTime(2026, 11, 19, 12),
        locale: 'en',
      ),
      'Roadmap',
    );
  });

  test('an empty editor still sends a TipTap document', () {
    final payload = documentContentPayload(Document());
    expect(payload, isA<Map<String, Object?>>());
    expect((payload as Map)['type'], 'doc');
  });

  test('plain text becomes TipTap JSON', () {
    final document = documentQuillFromContent('Quarterly plan');
    expect(document.toPlainText(), contains('Quarterly plan'));
    final payload = documentContentPayload(document);
    expect(payload, isA<Map<String, Object?>>());
    expect((payload as Map)['type'], 'doc');
  });

  testWidgets('the share sheet keeps visibility off the editor', (
    tester,
  ) async {
    var published = false;
    await tester.pumpApp(
      DocumentShareSheet(
        isPublic: false,
        onPublicChanged: (value) async {
          published = value;
          return true;
        },
        onDelete: () {},
      ),
    );
    expect(find.text('Public document'), findsOneWidget);
    expect(find.text('Only workspace members'), findsOneWidget);
    await tester.tap(find.text('Public document'));
    await tester.pump();
    expect(published, isTrue);
    expect(find.text('Anyone with the link'), findsOneWidget);
  });

  testWidgets('formatting actions toggle bold', (tester) async {
    final editor = QuillController.basic();
    addTearDown(editor.dispose);
    editor.document.insert(0, 'Plan');
    editor.updateSelection(
      const TextSelection(baseOffset: 0, extentOffset: 4),
      ChangeSource.local,
    );
    await tester.pumpApp(_FormatHost(editor: editor));
    await tester.tap(find.byTooltip('Bold'));
    await tester.pump();
    expect(
      editor.getSelectionStyle().attributes.containsKey(Attribute.bold.key),
      isTrue,
    );
    expect(find.byTooltip('Heading 1'), findsOneWidget);
    expect(find.byTooltip('Checklist'), findsOneWidget);
  });
}

class _FormatHost extends StatelessWidget {
  const _FormatHost({required this.editor});

  final QuillController editor;

  @override
  Widget build(BuildContext context) {
    return AppFormatToolbar(
      actions: documentFormatActions(
        context: context,
        editor: editor,
        onLink: () {},
      ),
    );
  }
}
