import 'dart:convert';

import 'package:flutter_quill/flutter_quill.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile/core/config/api_config.dart';
import 'package:mobile/data/models/task_link_option.dart';
import 'package:mobile/features/documents/document_links.dart';
import 'package:mobile/features/documents/document_media.dart';
import 'package:mobile/features/documents/document_mentions.dart';
import 'package:mobile/features/documents/document_table.dart';
import 'package:mobile/features/documents/view/document_inserts.dart';

import 'document_round_trip_fixtures.dart';

const _share =
    '/api/v1/workspaces/ws/storage/share?path=ws%2Fdocuments%2Fplan.pdf';

Map<String, dynamic> _cell(
  String type,
  List<Map<String, dynamic>> content, {
  int colspan = 1,
  int rowspan = 1,
}) => {
  'type': type,
  'attrs': {'colspan': colspan, 'rowspan': rowspan, 'colwidth': null},
  'content': content,
};

Map<String, dynamic> _table(List<List<Map<String, dynamic>>> rows) => {
  'type': 'table',
  'content': [
    for (final cells in rows) {'type': 'tableRow', 'content': cells},
  ],
};

void main() {
  group('Workspace file links', () {
    test('an editor-prefixed relative link is read back as stored', () {
      expect(normalizeDocumentLink('https:///api/v1/x'), '/api/v1/x');
      expect(normalizeDocumentLink('http:///api/v1/x'), '/api/v1/x');
      expect(
        normalizeDocumentLink('https://tuturuuu.com/a'),
        'https://tuturuuu.com/a',
      );
      expect(isDocumentStorageShareUrl('https://$_share'), isTrue);
    });

    test('a share link opens the signed URL its route answers with', () async {
      final requests = <http.BaseRequest>[];
      final launched = <Uri>[];
      final opened = await openDocumentLink(
        'https://$_share',
        client: MockClient((request) async {
          requests.add(request);
          return http.Response(
            '',
            307,
            headers: {'location': 'https://storage.test/signed?token=t'},
          );
        }),
        launch: (uri) async {
          launched.add(uri);
          return true;
        },
      );
      expect(opened, isTrue);
      expect(requests.single.url.toString(), '${ApiConfig.baseUrl}$_share');
      expect(requests.single.followRedirects, isFalse);
      expect(launched.single.toString(), 'https://storage.test/signed?token=t');
    });

    test('other links open as they are', () async {
      final launched = <Uri>[];
      Future<bool> launch(Uri uri) async {
        launched.add(uri);
        return true;
      }

      await openDocumentLink('https://tuturuuu.com/docs', launch: launch);
      await openDocumentLink('/api/v1/workspaces/ws/docs', launch: launch);
      expect(launched.map((uri) => uri.toString()), [
        'https://tuturuuu.com/docs',
        '${ApiConfig.baseUrl}/api/v1/workspaces/ws/docs',
      ]);
    });
  });

  group('Formatted table cells', () {
    final stored = _table([
      [
        _cell('tableHeader', [
          p([
            text('Owner', [
              {'type': 'bold'},
            ]),
          ]),
        ]),
        _cell('tableHeader', [
          p([text('Due')]),
        ]),
      ],
      [
        _cell('tableCell', [
          p([
            text('Ask '),
            {
              'type': 'mention',
              'attrs': {'userId': 'u1', 'displayName': 'Linh'},
            },
          ]),
        ]),
        _cell('tableCell', [
          {
            'type': 'bulletList',
            'content': [
              item([
                p([text('one')]),
              ]),
            ],
          },
        ]),
      ],
    ]);

    test('only plain text cells are editable', () {
      final table = DocumentTable.fromNode(stored);
      expect(table.isPlainCell(0, 0), isFalse, reason: 'bold');
      expect(table.isPlainCell(0, 1), isTrue);
      expect(table.isPlainCell(1, 0), isFalse, reason: 'mention');
      expect(table.isPlainCell(1, 1), isFalse, reason: 'list');
    });

    test('editing a formatted cell leaves it as stored', () {
      final before = jsonEncode(stored);
      final table = DocumentTable.fromNode(
        jsonDecode(before) as Map<String, dynamic>,
      );
      for (final (r, c) in [(0, 0), (1, 0), (1, 1)]) {
        table.setText(r, c, 'replaced');
      }
      expect(jsonEncode(table.toNode()), before);
      table.setText(0, 1, 'When');
      expect(jsonEncode(table.toNode()), contains('"text":"When"'));
    });
  });

  test('merged cells cover their grid positions', () {
    final table = DocumentTable.fromNode(
      _table([
        [
          _cell('tableHeader', [
            p([text('Wide')]),
          ], colspan: 2),
          _cell('tableHeader', [
            p([text('Tall')]),
          ], rowspan: 2),
        ],
        [
          _cell('tableCell', [
            p([text('a')]),
          ]),
          _cell('tableCell', [
            p([text('b')]),
          ]),
        ],
      ]),
    );
    final grid = table.grid();
    expect(grid, hasLength(2));
    expect(grid.first, hasLength(3));
    String at(int r, int c) {
      final slot = grid[r][c]!;
      return '${slot.row}${slot.col}'
          '${slot.origin ? 'o' : '-'}${slot.lastCol ? 'c' : '-'}'
          '${slot.lastRow ? 'r' : '-'}';
    }

    expect([for (var c = 0; c < 3; c++) at(0, c)], ['00o-r', '00-cr', '01oc-']);
    expect([for (var c = 0; c < 3; c++) at(1, c)], ['10ocr', '11ocr', '01-cr']);
  });

  group('Task mentions', () {
    test('carry the list colour and assignees as the web stores them', () {
      final task = TaskLinkOption.fromJson(const {
        'id': 't1',
        'name': 'Ship',
        'display_number': 7,
        'task_lists': {'name': 'Doing', 'color': 'BLUE'},
        'assignees': [
          {
            'user': {'id': 'u1', 'display_name': 'Linh', 'avatar_url': null},
          },
          {'id': 'u2', 'display_name': 'Minh'},
        ],
      });
      expect(task.listColor, 'BLUE');
      final attrs = documentMentionAttrs(
        DocumentMentionOption(
          id: task.id,
          label: task.name,
          displayNumber: task.displayNumber,
          listColor: task.listColor,
          assignees: task.assignees,
          workspaceId: 'ws',
          type: DocumentMentionType.task,
        ),
      );
      expect(attrs['listColor'], 'BLUE');
      expect(
        attrs['assignees'],
        jsonEncode([
          {'id': 'u1', 'display_name': 'Linh'},
          {'id': 'u2', 'display_name': 'Minh'},
        ]),
      );
    });

    test('a task without assignees stores none', () {
      final task = TaskLinkOption.fromJson(const {'id': 't1', 'name': 'Ship'});
      expect(task.assignees, isNull);
      expect(task.listColor, isNull);
    });
  });

  test('date shortcuts match their shown names', () {
    final dates = documentDateMentionOptions(DateTime(2026, 11, 25));
    final found = filterDocumentMentions(
      dates,
      'hôm',
      labelOf: (option) => option.id == 'today' ? 'Hôm nay' : option.label,
    );
    expect(found.single.id, 'today');
  });

  test('a stored number width stays a number when resized', () {
    final resized = resizeDocumentImage(newDocumentImageNode('/a.png'), 'sm');
    expect((resized['attrs'] as Map)['width'], 320);
  });

  test('an @ inside code is not a mention trigger', () {
    final editor = QuillController.basic();
    addTearDown(editor.dispose);
    editor.document.insert(0, 'a @b\nx @y\n');
    editor
      ..formatText(0, 1, Attribute.codeBlock)
      ..formatText(7, 2, Attribute.inlineCode);
    expect(documentOffsetIsCode(editor, 2), isTrue);
    expect(documentOffsetIsCode(editor, 7), isTrue);
    editor.formatText(7, 2, Attribute.clone(Attribute.inlineCode, null));
    expect(documentOffsetIsCode(editor, 7), isFalse);
  });
}
