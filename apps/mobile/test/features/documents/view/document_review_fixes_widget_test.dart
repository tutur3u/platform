import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/documents/document_media.dart';
import 'package:mobile/features/documents/document_media_pick.dart';
import 'package:mobile/features/documents/document_media_upload.dart';
import 'package:mobile/features/documents/view/document_editor.dart';
import 'package:mobile/features/documents/view/document_inserts.dart';
import 'package:mobile/features/documents/view/document_table_editor_sheet.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/helpers.dart';
import '../document_round_trip_fixtures.dart';

class _Uploader extends Mock implements DocumentMediaUploader {}

const _share =
    '/api/v1/workspaces/ws/storage/share?path=ws%2Fdocuments%2Fplan.pdf';

void main() {
  setUpAll(() => registerFallbackValue(Uint8List(0)));

  testWidgets('a tapped file link reaches the opener as stored', (
    tester,
  ) async {
    final document = Document()
      ..insert(0, 'plan.pdf')
      ..format(0, 8, const LinkAttribute(_share));
    final editor = QuillController(
      document: document,
      selection: const TextSelection.collapsed(offset: 0),
      readOnly: true,
    );
    final focus = FocusNode();
    final scroll = ScrollController();
    addTearDown(() {
      editor.dispose();
      focus.dispose();
      scroll.dispose();
    });
    final opened = <String>[];
    await tester.pumpApp(
      Scaffold(
        body: DocumentEditor(
          editor: editor,
          focusNode: focus,
          scrollController: scroll,
          status: DocumentSaveStatus.idle,
          owner: 'You',
          onLink: () {},
          onHighlight: () {},
          onOpenLink: opened.add,
        ),
      ),
    );
    await tester.pumpAndSettle();
    final box = tester.getRect(find.byType(QuillEditor));
    await tester.tapAt(box.topLeft + const Offset(20, 20));
    await tester.pumpAndSettle();
    expect(opened, [_share]);
  });

  testWidgets('formatted cells are read-only in the table editor', (
    tester,
  ) async {
    await tester.pumpApp(
      Scaffold(
        body: DocumentTableEditorSheet(
          node: {
            'type': 'table',
            'content': [
              {
                'type': 'tableRow',
                'content': [
                  {
                    'type': 'tableHeader',
                    'attrs': const {
                      'colspan': 1,
                      'rowspan': 1,
                      'colwidth': null,
                    },
                    'content': [
                      p([
                        text('Owner', [
                          {'type': 'bold'},
                        ]),
                      ]),
                    ],
                  },
                  {
                    'type': 'tableHeader',
                    'attrs': const {
                      'colspan': 1,
                      'rowspan': 1,
                      'colwidth': null,
                    },
                    'content': [
                      p([text('Due')]),
                    ],
                  },
                ],
              },
            ],
          },
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(
      find.byKey(const ValueKey('document-table-rich-0-0')),
      findsOneWidget,
    );
    expect(
      find.byKey(const ValueKey('document-table-field-0-0')),
      findsNothing,
    );
    expect(
      find.byKey(const ValueKey('document-table-field-0-1')),
      findsOneWidget,
    );
    expect(
      find.text('Formatted cells keep their formatting. Edit them on the web.'),
      findsOneWidget,
    );
  });

  group('Upload limits', () {
    Future<(QuillController, _Uploader, List<String>)> run(
      WidgetTester tester, {
      required DocumentMediaKind kind,
      required int size,
    }) async {
      final editor = QuillController.basic();
      addTearDown(editor.dispose);
      final uploader = _Uploader();
      when(
        () => uploader.upload(
          any(),
          name: any(named: 'name'),
          bytes: any(named: 'bytes'),
          contentType: any(named: 'contentType'),
        ),
      ).thenAnswer((_) async => _share);
      final reads = <String>[];
      await tester.pumpApp(
        Scaffold(
          body: Builder(
            builder: (context) => TextButton(
              onPressed: () => insertDocumentMedia(
                context,
                editor,
                kind: kind,
                wsId: 'ws',
                uploader: uploader,
                pick: (_) async => DocumentPickedFile(
                  name: 'big.png',
                  length: () async => size,
                  readAsBytes: () async {
                    reads.add('big.png');
                    return Uint8List(4);
                  },
                ),
              ),
              child: const Text('insert'),
            ),
          ),
        ),
      );
      await tester.tap(find.text('insert'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 100));
      return (editor, uploader, reads);
    }

    testWidgets('an image over 5 MB is refused before it is read', (
      tester,
    ) async {
      final (editor, uploader, reads) = await run(
        tester,
        kind: DocumentMediaKind.image,
        size: 5 * 1024 * 1024 + 1,
      );
      expect(find.text('Images can be at most 5 MB.'), findsOneWidget);
      expect(reads, isEmpty);
      verifyNever(
        () => uploader.upload(
          any(),
          name: any(named: 'name'),
          bytes: any(named: 'bytes'),
          contentType: any(named: 'contentType'),
        ),
      );
      expect(editor.document.toPlainText(), '\n');
      await tester.pump(const Duration(seconds: 5));
    });

    testWidgets('a video over 50 MB is refused', (tester) async {
      final (_, _, reads) = await run(
        tester,
        kind: DocumentMediaKind.video,
        size: 50 * 1024 * 1024 + 1,
      );
      expect(find.text('Videos can be at most 50 MB.'), findsOneWidget);
      expect(reads, isEmpty);
      await tester.pump(const Duration(seconds: 5));
    });

    testWidgets('an image within the limit uploads and is inserted', (
      tester,
    ) async {
      final (editor, uploader, reads) = await run(
        tester,
        kind: DocumentMediaKind.image,
        size: 1024,
      );
      expect(reads, ['big.png']);
      verify(
        () => uploader.upload(
          'ws',
          name: 'big.png',
          bytes: any(named: 'bytes'),
          contentType: any(named: 'contentType'),
        ),
      ).called(1);
      final embed = editor.document.toDelta().toList().first.data;
      expect(
        documentImageNodeFromEmbed((embed! as Map)[documentImageEmbedType]),
        newDocumentImageNode(_share),
      );
      await tester.pump(const Duration(seconds: 5));
    });
  });
}
