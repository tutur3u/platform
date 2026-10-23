import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/data/models/documents/workspace_document.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/document_repository.dart';
import 'package:mobile/features/documents/view/document_detail_page.dart';
import 'package:mobile/features/documents/view/documents_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/helpers.dart';

class _Workspace extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

class _Repository extends Mock implements DocumentRepository {}

const _clearance = 90.0;
const _document = WorkspaceDocument(
  id: 'doc-1',
  name: 'Roadmap',
  content: 'Quarterly plan',
  isPublic: false,
);

Future<void> _pump(WidgetTester tester, Widget page, Size size) async {
  tester.view
    ..devicePixelRatio = 1
    ..physicalSize = size;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  final workspace = _Workspace();
  whenListen(
    workspace,
    const Stream<WorkspaceState>.empty(),
    initialState: const WorkspaceState(
      status: WorkspaceStatus.loaded,
      currentWorkspace: Workspace(id: 'ws', personal: true),
    ),
  );
  addTearDown(workspace.close);
  await tester.pumpApp(
    BlocProvider<WorkspaceCubit>.value(
      value: workspace,
      // Publish dock clearance the way the shell's floating dock does.
      child: Builder(
        builder: (context) => MediaQuery(
          data: MediaQuery.of(
            context,
          ).copyWith(padding: const EdgeInsets.only(bottom: _clearance)),
          child: page,
        ),
      ),
    ),
  );
  await tester.pump();
  await tester.pump(const Duration(milliseconds: 50));
}

_Repository _repository() {
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
      documents: [_document],
      total: 1,
      limit: 30,
      offset: 0,
    ),
  );
  when(
    () => repository.getDocument(any(), any()),
  ).thenAnswer((_) async => _document);
  return repository;
}

void main() {
  group('Documents list uses the page primitive', () {
    for (final (size, left) in [
      (const Size(390, 844), 16.0),
      (const Size(700, 1000), 24.0 + 50),
      (const Size(1200, 800), 32.0 + 240),
    ]) {
      testWidgets('content starts at $left at ${size.width}', (tester) async {
        await _pump(tester, DocumentsPage(repository: _repository()), size);
        expect(find.byType(AppPageListView), findsOneWidget);
        final search = tester.getRect(find.byType(TextField));
        expect(search.left, closeTo(left, 0.5));
        expect(search.right, closeTo(size.width - left, 0.5));
        expect(find.text('Roadmap'), findsOneWidget);
        // The scrollable stays full width while content is centred.
        expect(tester.getSize(find.byType(ListView)).width, size.width);
      });
    }

    testWidgets('the list reserves dock clearance after the last item', (
      tester,
    ) async {
      await _pump(
        tester,
        DocumentsPage(repository: _repository()),
        const Size(390, 844),
      );
      final list = tester.widget<ListView>(find.byType(ListView));
      expect(
        list.padding!.resolve(TextDirection.ltr).bottom,
        _clearance + AppLayout.scrollEndGap,
      );
    });
  });

  group('Document editor uses the reading page body', () {
    testWidgets('fields follow the gutter and reading width', (tester) async {
      await _pump(
        tester,
        DocumentDetailPage(documentId: 'doc-1', repository: _repository()),
        const Size(1200, 800),
      );
      final body = find.byType(AppPageBody);
      expect(body, findsOneWidget);
      expect(tester.widget<AppPageBody>(body).kind, AppPageKind.reading);
      final title = tester.getRect(find.byType(TextField).first);
      // Expanded reading width 680, centred in 1200 with a 32dp gutter.
      expect(title.left, closeTo(32 + 260, 0.5));
      expect(title.width, closeTo(680 - 64, 0.5));
    });

    testWidgets('the editor scrolls beneath the dock with clearance', (
      tester,
    ) async {
      await _pump(
        tester,
        DocumentDetailPage(documentId: 'doc-1', repository: _repository()),
        const Size(390, 844),
      );
      final editor = tester.widget<TextField>(find.byType(TextField).last);
      final padding = editor.decoration!.contentPadding!.resolve(
        TextDirection.ltr,
      );
      expect(padding.bottom, _clearance + AppLayout.scrollEndGap);
      expect(padding.left, 0);
      expect(tester.getRect(find.byType(TextField).last).left, 16);
    });
  });
}
