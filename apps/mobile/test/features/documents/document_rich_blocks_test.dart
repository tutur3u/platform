import 'dart:convert';

import 'package:flutter/widgets.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/documents/document_media.dart';
import 'package:mobile/features/documents/document_mentions.dart';
import 'package:mobile/features/documents/document_table.dart';
import 'package:mobile/features/documents/documents_content.dart';
import 'package:mobile/features/documents/view/document_block_insert.dart';
import 'package:mobile/features/documents/view/document_image_embed.dart';
import 'package:mobile/features/documents/view/document_inserts.dart';
import 'package:mobile/features/documents/view/document_table_embed.dart';

import 'document_round_trip_fixtures.dart';

Map<String, dynamic> _cell(String type, List<Map<String, dynamic>> content) => {
  'type': type,
  'attrs': {'colspan': 1, 'rowspan': 1, 'colwidth': null},
  'content': content,
};

/// A table as the web stores one, with marks and a column width the
/// mobile editor cannot show.
Map<String, dynamic> _storedTable() => {
  'type': 'table',
  'content': [
    {
      'type': 'tableRow',
      'content': [
        _cell('tableHeader', [
          p([
            text('Name', [
              {'type': 'bold'},
            ]),
          ]),
        ]),
        {
          ..._cell('tableHeader', [
            p([text('Owner')]),
          ]),
          'attrs': {
            'colspan': 1,
            'rowspan': 1,
            'colwidth': [180],
          },
        },
      ],
    },
    {
      'type': 'tableRow',
      'content': [
        _cell('tableCell', [
          p([text('Launch')]),
        ]),
        _cell('tableCell', [
          p([text('Linh')]),
        ]),
      ],
    },
  ],
};

/// An image as the web stores one after a drag resize: a string width and
/// layout styles.
Map<String, dynamic> _storedImage() => {
  'type': 'imageResize',
  'attrs': {
    'src': '/api/v1/workspaces/ws/storage/share?path=ws%2Fdocuments%2Fa.png',
    'alt': null,
    'title': null,
    'width': '320',
    'height': null,
    'containerStyle': 'width: 320px; height: auto; cursor: pointer;',
    'wrapperStyle': 'display: flex; margin: 0;',
  },
};

Map<String, dynamic> _doc(List<Map<String, dynamic>> content) => {
  'type': 'doc',
  'content': content,
};

({DocumentContentSnapshot snapshot, QuillController editor}) _open(
  Map<String, dynamic> doc,
) {
  final snapshot = DocumentContentSnapshot.parse(jsonEncode(doc));
  final editor = QuillController(
    document: snapshot.toQuill(),
    selection: const TextSelection.collapsed(offset: 0),
  );
  addTearDown(editor.dispose);
  return (snapshot: snapshot, editor: editor);
}

List<Map<String, dynamic>> _saved(
  DocumentContentSnapshot snapshot,
  QuillController editor,
) => [
  for (final node in snapshot.payloadFor(editor.document)['content'] as List)
    (node as Map).cast<String, dynamic>(),
];

/// The offset of the first embed of [type].
int _embedOffset(QuillController editor, String type) {
  var offset = 0;
  for (final op in editor.document.toDelta().toList()) {
    final data = op.data;
    if (data is Map && data.containsKey(type)) return offset;
    offset += op.length!;
  }
  fail('no $type embed');
}

void _typeAtEnd(QuillController editor, String value) {
  final end = editor.document.length - 1;
  editor.replaceText(
    end,
    0,
    value,
    TextSelection.collapsed(offset: end + value.length),
  );
}

void main() {
  group('Tables', () {
    test('a new table is the web toolbar table', () {
      expect(jsonEncode(newDocumentTable()), jsonEncode(_webTable3x3()));
    });

    test('an inserted table saves as the web stores it', () {
      final opened = _open(
        _doc([
          p([text('Intro')]),
        ]),
      );
      final editor = opened.editor
        ..updateSelection(
          const TextSelection.collapsed(offset: 5),
          ChangeSource.local,
        );
      insertDocumentBlock(
        editor,
        BlockEmbed(documentTableEmbedType, jsonEncode(newDocumentTable())),
      );
      final saved = _saved(opened.snapshot, editor);
      expect(saved.first, p([text('Intro')]));
      expect(jsonEncode(saved[1]), jsonEncode(_webTable3x3()));
    });

    test('an untouched table stays verbatim while text around it changes', () {
      final table = _storedTable();
      final opened = _open(
        _doc([
          p([text('Before')]),
          table,
          p([text('After')]),
        ]),
      );
      _typeAtEnd(opened.editor, ' more');
      final saved = _saved(opened.snapshot, opened.editor);
      expect(jsonEncode(saved[1]), jsonEncode(table));
      expect(jsonEncode(saved.last), contains('After more'));
    });

    test('editing one cell keeps every other cell as stored', () {
      final stored = _storedTable();
      final opened = _open(_doc([stored]));
      final editor = opened.editor;
      final table = DocumentTable.fromNode(stored)..setText(1, 1, 'Minh');
      replaceDocumentEmbed(
        editor,
        _embedOffset(editor, documentTableEmbedType),
        BlockEmbed(documentTableEmbedType, jsonEncode(table.toNode())),
      );
      final saved = _saved(opened.snapshot, editor).single;
      final rows = saved['content'] as List;
      final header = (rows.first as Map)['content'] as List;
      expect(
        jsonEncode(header),
        jsonEncode(((stored['content'] as List).first as Map)['content']),
      );
      final body = (rows.last as Map)['content'] as List;
      expect(
        jsonEncode(body.first),
        jsonEncode(
          _cell('tableCell', [
            p([text('Launch')]),
          ]),
        ),
      );
      expect(
        jsonEncode(body.last),
        jsonEncode(
          _cell('tableCell', [
            p([text('Minh')]),
          ]),
        ),
      );
    });

    test('rows and columns are added and removed with web cells', () {
      final table = DocumentTable.fromNode(_storedTable())
        ..addRow()
        ..addColumn();
      expect(table.rowCount, 3);
      expect(table.columnCount, 3);
      final node = table.toNode();
      final rows = node['content'] as List;
      final headerCells = (rows.first as Map)['content'] as List;
      expect(
        jsonEncode(headerCells.last),
        jsonEncode(_cell('tableHeader', [p([])..remove('content')])),
      );
      final added = (rows.last as Map)['content'] as List;
      expect(added.map((cell) => (cell as Map)['type']).toSet(), {'tableCell'});
      table
        ..removeRow(2)
        ..removeColumn(2);
      expect(jsonEncode(table.toNode()), jsonEncode(_storedTable()));
    });

    test('the header row toggles between header and body cells', () {
      final table = DocumentTable.fromNode(_storedTable());
      expect(table.hasHeaderRow, isTrue);
      table.toggleHeaderRow();
      expect(table.hasHeaderRow, isFalse);
      table.toggleHeaderRow();
      expect(jsonEncode(table.toNode()), jsonEncode(_storedTable()));
    });

    test('merged cells are detected so only text can change', () {
      final merged = _storedTable();
      final firstRow = ((merged['content'] as List).first as Map)['content'];
      (firstRow as List).first = _cell('tableHeader', [
        p([text('Wide')]),
      ])..['attrs'] = {'colspan': 2, 'rowspan': 1, 'colwidth': null};
      expect(DocumentTable.fromNode(merged).hasMergedCells, isTrue);
      expect(DocumentTable.fromNode(_storedTable()).hasMergedCells, isFalse);
    });

    test('deleting a table removes it and its line', () {
      final opened = _open(
        _doc([
          p([text('Before')]),
          _storedTable(),
          p([text('After')]),
        ]),
      );
      deleteDocumentBlock(
        opened.editor,
        _embedOffset(opened.editor, documentTableEmbedType),
      );
      final saved = _saved(opened.snapshot, opened.editor);
      expect(saved, [
        p([text('Before')]),
        p([text('After')]),
      ]);
    });
  });

  group('Images', () {
    test('an untouched image keeps every stored attribute', () {
      final image = _storedImage();
      final opened = _open(
        _doc([
          image,
          p([text('Caption')]),
        ]),
      );
      _typeAtEnd(opened.editor, '!');
      final saved = _saved(opened.snapshot, opened.editor);
      expect(jsonEncode(saved.first), jsonEncode(image));
      expect(jsonEncode(saved.last), contains('Caption!'));
    });

    test('resizing writes the width and its style, nothing else', () {
      final image = _storedImage();
      final opened = _open(_doc([image]));
      final editor = opened.editor;
      final offset = _embedOffset(editor, documentImageEmbedType);
      final node = documentImageNodeFromEmbed(
        documentEmbedAt(editor, offset, documentImageEmbedType),
      )!;
      expect(documentImageSizePreset(node), 'sm');
      applyDocumentImageAction(_FakeContext(), editor, offset, node, (
        preset: 'lg',
        view: false,
        delete: false,
      ));
      final saved = _saved(opened.snapshot, editor).single;
      expect(saved['attrs'], {
        ...(image['attrs'] as Map),
        // A string width, as the web's resize handle writes, stays one.
        'width': '640',
        'containerStyle': 'width: 640px; height: auto; cursor: pointer;',
      });
    });

    test('resizing an image without a style leaves the style unset', () {
      final node = newDocumentImageNode('/x.png');
      final resized = resizeDocumentImage(node, 'xl');
      expect(resized['attrs'], {...(node['attrs'] as Map), 'width': 800});
    });

    test('an inserted image is the web imageResize node', () {
      final opened = _open(
        _doc([
          p([text('Intro')]),
        ]),
      );
      final editor = opened.editor
        ..updateSelection(
          const TextSelection.collapsed(offset: 5),
          ChangeSource.local,
        );
      const src =
          '/api/v1/workspaces/ws/storage/share?path=ws%2Fdocuments%2Fb.png';
      insertDocumentBlock(
        editor,
        BlockEmbed(
          documentImageEmbedType,
          documentImageEmbedValue(newDocumentImageNode(src)),
        ),
      );
      final saved = _saved(opened.snapshot, editor);
      expect(
        jsonEncode(saved[1]),
        jsonEncode({
          'type': 'imageResize',
          'attrs': {
            'src': src,
            'alt': null,
            'title': null,
            'width': 480,
            'height': null,
            'containerStyle': null,
            'wrapperStyle': null,
          },
        }),
      );
    });

    test('deleting an image removes it', () {
      final opened = _open(
        _doc([
          _storedImage(),
          p([text('After')]),
        ]),
      );
      final editor = opened.editor;
      final offset = _embedOffset(editor, documentImageEmbedType);
      applyDocumentImageAction(
        _FakeContext(),
        editor,
        offset,
        documentImageNodeFromEmbed(
          documentEmbedAt(editor, offset, documentImageEmbedType),
        )!,
        (preset: null, view: false, delete: true),
      );
      expect(_saved(opened.snapshot, editor), [
        p([text('After')]),
      ]);
    });

    test('an inserted video is the web video node', () {
      final opened = _open(
        _doc([
          p([text('Intro')]),
        ]),
      );
      final editor = opened.editor
        ..updateSelection(
          const TextSelection.collapsed(offset: 5),
          ChangeSource.local,
        );
      insertDocumentBlock(editor, BlockEmbed.video('/v.mp4'));
      expect(
        _saved(opened.snapshot, editor)[1],
        newDocumentVideoNode('/v.mp4'),
      );
    });

    test('a file link stores the share URL as a link mark', () {
      final opened = _open(
        _doc([
          p([text('See ')]),
        ]),
      );
      final editor = opened.editor
        ..updateSelection(
          const TextSelection.collapsed(offset: 4),
          ChangeSource.local,
        );
      insertDocumentFileLink(editor, name: 'plan.pdf', url: '/share?p=1');
      final saved = jsonEncode(_saved(opened.snapshot, editor).single);
      expect(saved, contains('"text":"plan.pdf"'));
      expect(saved, contains('/share?p=1'));
    });
  });

  group('Mentions', () {
    test('a picked member writes the web mention attributes', () {
      final opened = _open(
        _doc([
          p([text('Ask ')]),
        ]),
      );
      final editor = opened.editor;
      const option = DocumentMentionOption(
        id: 'u1',
        label: 'Linh',
        avatarUrl: 'https://cdn.tuturuuu.com/avatars/u1.png',
        type: DocumentMentionType.user,
      );
      editor.replaceText(
        4,
        0,
        Embeddable('mention', documentMentionEmbedValue(option)),
        const TextSelection.collapsed(offset: 5),
      );
      final saved = _saved(opened.snapshot, editor).single;
      expect((saved['content'] as List)[1], {
        'type': 'mention',
        'attrs': {
          'userId': 'u1',
          'entityId': 'u1',
          'entityType': 'user',
          'displayName': 'Linh',
          'avatarUrl': 'https://cdn.tuturuuu.com/avatars/u1.png',
          'subtitle': null,
          'priority': null,
          'listColor': null,
          'assignees': null,
          'workspaceId': null,
        },
      });
    });

    test('a task mention shows its number and keeps its name', () {
      final attrs = documentMentionAttrs(
        const DocumentMentionOption(
          id: 't1',
          label: 'Ship docs',
          subtitle: 'Doing',
          displayNumber: 42,
          priority: 'high',
          workspaceId: 'ws',
          type: DocumentMentionType.task,
        ),
      );
      expect(attrs['userId'], isNull);
      expect(attrs['displayName'], '42');
      expect(attrs['subtitle'], 'Ship docs');
      expect(attrs['priority'], 'high');
      expect(attrs['workspaceId'], 'ws');
    });

    test('date shortcuts and picked dates match the web', () {
      final dates = documentDateMentionOptions(DateTime(2026, 11, 25, 9));
      expect(dates.map((d) => d.id), [
        'today',
        'tomorrow',
        'next-week',
        'next-month',
      ]);
      expect(dates.first.subtitle, 'Nov 25, 2026');
      expect(dates.last.subtitle, 'Dec 25, 2026');
      final picked = documentCustomDateMention(DateTime.utc(2026, 12, 3));
      expect(picked.id, 'custom-2026-12-03T00:00:00.000Z');
      expect(documentMentionAttrs(picked)['displayName'], 'Dec 3, 2026');
    });

    test('an @ starts a mention only at a word start', () {
      expect(startsDocumentMention('@', 0), isTrue);
      expect(startsDocumentMention('hi @', 3), isTrue);
      expect(startsDocumentMention('a\n@', 2), isTrue);
      expect(startsDocumentMention('me@x', 2), isFalse);
    });

    test('a search matches labels and subtitles', () {
      const options = [
        DocumentMentionOption(
          id: '1',
          label: 'Linh',
          type: DocumentMentionType.user,
        ),
        DocumentMentionOption(
          id: '2',
          label: 'Roadmap',
          subtitle: 'active',
          type: DocumentMentionType.project,
        ),
      ];
      expect(filterDocumentMentions(options, 'LIN').single.id, '1');
      expect(filterDocumentMentions(options, 'activ').single.id, '2');
      expect(filterDocumentMentions(options, ' '), options);
    });
  });

  group('Uploads', () {
    test('share URLs encode the path as the web does', () {
      expect(
        documentStorageShareUrl('ws-1', 'ws-1/documents/a b~(1)*.png'),
        '/api/v1/workspaces/ws-1/storage/share?'
        'path=ws-1%2Fdocuments%2Fa+b%7E%281%29*.png',
      );
    });

    test('upload names follow the web pattern', () {
      final name = documentUploadFileName('Photo.HEIC', now: 1700000000000);
      expect(name, matches(RegExp(r'^1700000000000-[0-9a-z]{11}\.HEIC$')));
    });
  });
}

Map<String, dynamic> _webTable3x3() {
  Map<String, dynamic> cell(String type) => {
    'type': type,
    'attrs': {'colspan': 1, 'rowspan': 1, 'colwidth': null},
    'content': [
      {
        'type': 'paragraph',
        'attrs': {'textAlign': null},
      },
    ],
  };
  return {
    'type': 'table',
    'content': [
      for (var r = 0; r < 3; r++)
        {
          'type': 'tableRow',
          'content': [
            for (var c = 0; c < 3; c++)
              cell(r == 0 ? 'tableHeader' : 'tableCell'),
          ],
        },
    ],
  };
}

class _FakeContext extends Fake implements BuildContext {}
