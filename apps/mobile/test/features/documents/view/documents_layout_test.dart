import 'dart:math' as math;

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_quill/flutter_quill.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/responsive/breakpoints.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/data/models/documents/workspace_document.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/document_repository.dart';
import 'package:mobile/features/documents/view/document_detail_page.dart';
import 'package:mobile/features/documents/view/documents_page.dart';
import 'package:mobile/features/shell/view/shell_mini_nav.dart';
import 'package:mobile/features/shell/view/shell_title_override.dart';
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
  updatedAt: '2026-11-19T02:00:00.000Z',
  ownerIsViewer: true,
);

Future<void> _pump(
  WidgetTester tester,
  Widget page,
  Size size, {
  double keyboard = 0,
}) async {
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
          data: MediaQuery.of(context).copyWith(
            padding: const EdgeInsets.only(bottom: _clearance),
            viewInsets: EdgeInsets.only(bottom: keyboard),
          ),
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
    for (final size in [
      const Size(390, 844),
      const Size(700, 1000),
      const Size(1200, 800),
    ]) {
      testWidgets('centres detail content at ${size.width}', (tester) async {
        await _pump(tester, DocumentsPage(repository: _repository()), size);
        final page = tester.widget<AppPageListView>(
          find.byType(AppPageListView),
        );
        expect(page.kind, AppPageKind.detail);
        final deviceClass = Breakpoints.fromWidth(size.width);
        final cap = AppLayout.maxContentWidth(AppPageKind.detail, deviceClass);
        final width = math.min(size.width, cap ?? size.width);
        final inset = (size.width - width) / 2 + AppLayout.gutter(deviceClass);
        expect(find.text('Documents'), findsNothing);
        expect(find.text('Roadmap'), findsOneWidget);
        expect(find.text('You'), findsOneWidget);
        final list = tester.widget<ListView>(find.byType(ListView));
        final padding = list.padding!.resolve(TextDirection.ltr);
        expect(padding.left, closeTo(inset, 0.5));
        expect(padding.right, closeTo(inset, 0.5));
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
      const size = Size(1200, 800);
      await _pump(
        tester,
        DocumentDetailPage(documentId: 'doc-1', repository: _repository()),
        size,
      );
      final body = find.byType(AppPageBody);
      expect(body, findsOneWidget);
      expect(tester.widget<AppPageBody>(body).kind, AppPageKind.reading);
      expect(find.text('Document name'), findsNothing);
      final deviceClass = Breakpoints.fromWidth(size.width);
      final gutter = AppLayout.gutter(deviceClass);
      final cap = AppLayout.maxContentWidth(AppPageKind.reading, deviceClass)!;
      final width = math.min(size.width, cap);
      final inset = (size.width - width) / 2 + gutter;
      for (final field in [find.byType(QuillEditor)]) {
        final rect = tester.getRect(field);
        expect(rect.left, closeTo(inset, 0.5));
        expect(rect.width, closeTo(width - 2 * gutter, 0.5));
      }
      final nav = tester.widget<ShellMiniNav>(find.byType(ShellMiniNav));
      expect(nav.items, isEmpty);
      expect(nav.deepLinkBackRoute, Routes.documents);
    });

    testWidgets('the formatting toolbar sits above the dock', (tester) async {
      await _pump(
        tester,
        DocumentDetailPage(documentId: 'doc-1', repository: _repository()),
        const Size(390, 844),
      );
      final toolbar = tester.getRect(find.byType(AppFormatToolbar));
      expect(toolbar.left, 0);
      expect(toolbar.width, 390);
      expect(toolbar.bottom, closeTo(844 - _clearance, 0.5));
      expect(tester.getRect(find.byType(QuillEditor)).left, 16);
    });

    testWidgets('the shell title is the editable document title', (
      tester,
    ) async {
      final repository = _repository();
      when(
        () => repository.updateDocument(
          any(),
          any(),
          name: any(named: 'name'),
          content: any(named: 'content'),
          isPublic: any(named: 'isPublic'),
        ),
      ).thenAnswer((_) async {});
      await _pump(
        tester,
        DocumentDetailPage(documentId: 'doc-1', repository: repository),
        const Size(390, 844),
      );
      final override = tester.widget<ShellTitleOverride>(
        find.byType(ShellTitleOverride),
      );
      expect(override.title, 'Roadmap');
      expect(override.showLeadingBrand, isFalse);
      expect(override.onTitleSubmitted, isNotNull);
      expect(find.text('Roadmap'), findsNothing);

      await override.onTitleSubmitted!('Roadmap 2027');
      await tester.pump();
      verify(
        () => repository.updateDocument(
          'ws',
          'doc-1',
          name: 'Roadmap 2027',
          content: any(named: 'content'),
        ),
      ).called(1);
      final renamed = tester.widget<ShellTitleOverride>(
        find.byType(ShellTitleOverride),
      );
      expect(renamed.title, 'Roadmap 2027');
    });

    testWidgets('the formatting toolbar lifts with the keyboard', (
      tester,
    ) async {
      await _pump(
        tester,
        DocumentDetailPage(documentId: 'doc-1', repository: _repository()),
        const Size(390, 844),
        keyboard: 300,
      );
      final toolbar = tester.getRect(find.byType(AppFormatToolbar));
      expect(toolbar.bottom, closeTo(844 - 300, 0.5));
    });
  });
}
