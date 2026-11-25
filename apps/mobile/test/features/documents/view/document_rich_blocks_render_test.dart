import 'dart:convert';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/documents/workspace_document.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/document_repository.dart';
import 'package:mobile/features/documents/document_mentions.dart';
import 'package:mobile/features/documents/document_table.dart';
import 'package:mobile/features/documents/view/document_detail_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/design_render_harness.dart';
import 'document_mention_fakes.dart';

class _Workspace extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

class _Repository extends Mock implements DocumentRepository {}

const _sizes = {
  'phone': Size(390, 844),
  'tablet': Size(834, 1194),
  'desktop': Size(1440, 900),
};

Map<String, dynamic> _p(List<Map<String, dynamic>> content) => {
  'type': 'paragraph',
  'attrs': {'textAlign': null},
  'content': content,
};

Map<String, dynamic> _text(String value) => {'type': 'text', 'text': value};

Map<String, dynamic> _table() {
  final table = DocumentTable.fromNode(newDocumentTable());
  const cells = [
    ['Milestone', 'Owner', 'Due'],
    ['Beta', 'Linh', 'Dec 1'],
    ['Launch', 'Minh', 'Jan 6'],
  ];
  for (var r = 0; r < 3; r++) {
    for (var c = 0; c < 3; c++) {
      table.setText(r, c, cells[r][c]);
    }
  }
  return table.toNode();
}

final String _content = jsonEncode({
  'type': 'doc',
  'content': [
    _p([
      _text('Launch plan with '),
      {
        'type': 'mention',
        'attrs': documentMentionAttrs(
          const DocumentMentionOption(
            id: 'u1',
            label: 'Linh',
            type: DocumentMentionType.user,
          ),
        ),
      },
      _text(' and the team.'),
    ]),
    _table(),
    {
      'type': 'imageResize',
      'attrs': {
        'src':
            '/api/v1/workspaces/ws/storage/share?path=ws%2Fdocuments%2Fa.png',
        'alt': 'Roadmap',
        'title': null,
        'width': 480,
        'height': null,
        'containerStyle': null,
        'wrapperStyle': null,
      },
    },
    _p([_text('Next steps follow the review.')]),
  ],
});

Future<void> _pump(
  WidgetTester tester,
  Size size,
  Brightness brightness,
) async {
  DesignRender.setSize(tester, size);
  final repository = _Repository();
  when(() => repository.getDocument(any(), any())).thenAnswer(
    (_) async => WorkspaceDocument(
      id: 'doc-1',
      name: 'Launch plan',
      content: _content,
      isPublic: false,
      updatedAt: '2026-11-19T02:00:00.000Z',
      ownerIsViewer: true,
    ),
  );
  final workspace = _Workspace();
  whenListen(
    workspace,
    const Stream<WorkspaceState>.empty(),
    initialState: const WorkspaceState(
      status: WorkspaceStatus.loaded,
      currentWorkspace: Workspace(id: 'ws', name: 'Studio'),
    ),
  );
  addTearDown(workspace.close);
  final settings = DesignRender.themes[brightness.name]!.$1;
  await tester.pumpWidget(
    DesignRenderApp(
      settings: settings,
      brightness: brightness,
      child: BlocProvider<WorkspaceCubit>.value(
        value: workspace,
        child: Builder(
          builder: (context) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(padding: const EdgeInsets.only(bottom: 90)),
            child: DocumentDetailPage(
              documentId: 'doc-1',
              repository: repository,
              mentionSource: (_) => FakeMentionSource(const [
                DocumentMentionOption(
                  id: 'u1',
                  label: 'Linh Tran',
                  type: DocumentMentionType.user,
                ),
                DocumentMentionOption(
                  id: 'u2',
                  label: 'Minh Pham',
                  type: DocumentMentionType.user,
                ),
                DocumentMentionOption(
                  id: 'p1',
                  label: 'Q1 roadmap',
                  subtitle: 'active',
                  type: DocumentMentionType.project,
                ),
                DocumentMentionOption(
                  id: 't1',
                  label: 'Ship document tables',
                  subtitle: 'In progress',
                  displayNumber: 42,
                  type: DocumentMentionType.task,
                ),
              ]),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 100));
}

Future<void> _open(WidgetTester tester, Finder finder) async {
  await tester.ensureVisible(finder);
  await tester.tap(finder);
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 600));
}

void main() {
  setUpAll(DesignRender.loadFonts);

  for (final MapEntry(key: size, value: dimensions) in _sizes.entries) {
    for (final brightness in Brightness.values) {
      final suffix = '$size-${brightness.name}';

      testWidgets('rich editor $suffix', (tester) async {
        await _pump(tester, dimensions, brightness);
        expect(find.text('Milestone'), findsOneWidget);
        expect(tester.takeException(), isNull);
        await DesignRender.capture(tester, 'docs-d3-editor-$suffix');
      });

      testWidgets('table insert $suffix', (tester) async {
        await _pump(tester, dimensions, brightness);
        await _open(tester, find.byTooltip('Table'));
        expect(tester.takeException(), isNull);
        await DesignRender.capture(tester, 'docs-d3-table-insert-$suffix');
      });

      testWidgets('table editor $suffix', (tester) async {
        await _pump(tester, dimensions, brightness);
        await _open(tester, find.byKey(const ValueKey('document-table-edit')));
        expect(find.text('Edit table'), findsWidgets);
        expect(tester.takeException(), isNull);
        await DesignRender.capture(tester, 'docs-d3-table-editor-$suffix');
      });

      testWidgets('mention picker $suffix', (tester) async {
        await _pump(tester, dimensions, brightness);
        await _open(tester, find.byTooltip('Mention'));
        expect(find.text('Linh Tran'), findsOneWidget);
        expect(tester.takeException(), isNull);
        await DesignRender.capture(tester, 'docs-d3-mention-$suffix');
      });

      testWidgets('image sheet $suffix', (tester) async {
        await _pump(tester, dimensions, brightness);
        await _open(tester, find.byKey(const ValueKey('document-image')));
        expect(find.text('Edit image'), findsOneWidget);
        expect(tester.takeException(), isNull);
        await DesignRender.capture(tester, 'docs-d3-image-$suffix');
      });
    }
  }
}
