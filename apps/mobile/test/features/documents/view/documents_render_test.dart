import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/documents/workspace_document.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/document_repository.dart';
import 'package:mobile/features/documents/view/document_detail_page.dart';
import 'package:mobile/features/documents/view/documents_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/design_render_harness.dart';

class _Workspace extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

class _Repository extends Mock implements DocumentRepository {}

const _documents = [
  WorkspaceDocument(
    id: 'doc-1',
    name: 'Roadmap',
    content: 'Quarterly plan',
    isPublic: false,
    createdAt: '2026-11-19T02:00:00.000Z',
  ),
  WorkspaceDocument(
    id: 'doc-2',
    name: '',
    content: '',
    isPublic: true,
    createdAt: '2026-11-18T02:00:00.000Z',
  ),
  WorkspaceDocument(
    id: 'doc-3',
    name: 'Weekly plan',
    content: 'Notes',
    isPublic: false,
    createdAt: '2026-11-02T02:00:00.000Z',
  ),
];

Future<void> _pump(
  WidgetTester tester, {
  required Widget page,
  required Brightness brightness,
}) async {
  DesignRender.setSize(tester, DesignRender.sizes['phone']!);
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
  final settings = brightness == Brightness.dark
      ? DesignRender.themes['dark']!.$1
      : DesignRender.themes['light']!.$1;
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
            child: page,
          ),
        ),
      ),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
}

_Repository _repository({WorkspaceDocument? detail}) {
  final repository = _Repository();
  when(
    () => repository.listDocuments(
      any(),
      search: any(named: 'search'),
      limit: any(named: 'limit'),
      offset: any(named: 'offset'),
    ),
  ).thenAnswer(
    (_) async => const WorkspaceDocumentsPage(
      documents: _documents,
      total: 3,
      limit: 30,
      offset: 0,
    ),
  );
  when(
    () => repository.getDocument(any(), any()),
  ).thenAnswer((_) async => detail ?? _documents.first);
  return repository;
}

void main() {
  setUpAll(DesignRender.loadFonts);

  for (final brightness in [Brightness.light, Brightness.dark]) {
    final name = brightness.name;
    testWidgets('documents list $name', (tester) async {
      await _pump(
        tester,
        brightness: brightness,
        page: DocumentsPage(repository: _repository()),
      );
      expect(find.text('Roadmap'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await DesignRender.capture(tester, 'documents-list-$name');
    });

    testWidgets('document editor $name', (tester) async {
      await _pump(
        tester,
        brightness: brightness,
        page: DocumentDetailPage(
          documentId: 'doc-1',
          repository: _repository(),
        ),
      );
      expect(find.byTooltip('Heading 1'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await DesignRender.capture(tester, 'documents-editor-$name');
    });
  }
}
