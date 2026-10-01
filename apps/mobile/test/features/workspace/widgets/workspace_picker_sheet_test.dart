import 'dart:async';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/features/workspace/widgets/hidden_workspaces_settings_row.dart';
import 'package:mobile/features/workspace/widgets/workspace_picker_sheet.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/helpers.dart';

class _MockWorkspaceCubit extends MockCubit<WorkspaceState>
    implements WorkspaceCubit {}

void main() {
  group('WorkspacePickerSheet', () {
    late WorkspaceCubit workspaceCubit;

    const personalWorkspace = Workspace(
      id: 'personal_ws',
      name: 'Alex Nguyen',
      personal: true,
      tier: workspaceTierPlus,
      avatarUrl: 'https://example.com/alex.png',
    );
    const proWorkspace = Workspace(
      id: 'ws_1',
      name: 'Product',
      tier: workspaceTierPro,
    );
    const enterpriseWorkspace = Workspace(
      id: 'ws_3',
      name: 'Ops',
      tier: workspaceTierEnterprise,
    );
    const freeWorkspace = Workspace(id: 'ws_2', name: 'Design');

    setUp(() {
      workspaceCubit = _MockWorkspaceCubit();
      when(() => workspaceCubit.hasAuthenticatedActor).thenReturn(false);
      when(
        () => workspaceCubit.refreshHiddenWorkspaces(),
      ).thenAnswer((_) async {});
    });

    testWidgets('shows tier badges for each workspace', (tester) async {
      const state = WorkspaceState(
        status: WorkspaceStatus.loaded,
        workspaces: [
          personalWorkspace,
          proWorkspace,
          enterpriseWorkspace,
          freeWorkspace,
        ],
        currentWorkspace: proWorkspace,
        defaultWorkspace: freeWorkspace,
      );
      when(() => workspaceCubit.state).thenReturn(state);
      whenListen(
        workspaceCubit,
        const Stream<WorkspaceState>.empty(),
        initialState: state,
      );

      await tester.pumpApp(
        BlocProvider<WorkspaceCubit>.value(
          value: workspaceCubit,
          child: Builder(
            builder: (context) => Scaffold(
              body: Center(
                child: TextButton(
                  onPressed: () => showWorkspacePickerSheet(context),
                  child: const Text('Open picker'),
                ),
              ),
            ),
          ),
        ),
      );

      await tester.tap(find.text('Open picker'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 250));

      expect(find.text('Alex Nguyen'), findsOneWidget);
      expect(find.text('Product'), findsOneWidget);
      expect(find.text('Ops'), findsOneWidget);
      expect(find.text('Design'), findsOneWidget);
      expect(find.text('Plus'), findsOneWidget);
      expect(find.text('Pro'), findsOneWidget);
      expect(find.text('Enterprise'), findsOneWidget);
      expect(find.text('Free'), findsOneWidget);
    });

    testWidgets('keeps filtered results stable when search loses focus', (
      tester,
    ) async {
      const state = WorkspaceState(
        status: WorkspaceStatus.loaded,
        workspaces: [personalWorkspace, proWorkspace, freeWorkspace],
        currentWorkspace: proWorkspace,
        defaultWorkspace: freeWorkspace,
      );
      when(() => workspaceCubit.state).thenReturn(state);
      whenListen(
        workspaceCubit,
        const Stream<WorkspaceState>.empty(),
        initialState: state,
      );

      await tester.pumpApp(
        BlocProvider<WorkspaceCubit>.value(
          value: workspaceCubit,
          child: Builder(
            builder: (context) => Scaffold(
              body: Center(
                child: TextButton(
                  onPressed: () => showWorkspacePickerSheet(context),
                  child: const Text('Open picker'),
                ),
              ),
            ),
          ),
        ),
      );

      await tester.tap(find.text('Open picker'));
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 250));

      expect(find.byType(EditableText), findsNothing);
      expect(find.text('Product'), findsOneWidget);
      expect(find.text('Design'), findsOneWidget);

      await tester.tap(find.byIcon(Icons.search_rounded).first);
      await tester.pumpAndSettle();

      expect(find.byType(EditableText), findsOneWidget);
      await tester.enterText(find.byType(EditableText), 'Product');
      await tester.pumpAndSettle();

      expect(find.text('Product'), findsNWidgets(2));
      expect(find.text('Design'), findsNothing);

      FocusManager.instance.primaryFocus?.unfocus();
      await tester.pumpAndSettle();

      expect(find.byType(EditableText), findsOneWidget);
      expect(find.text('Design'), findsNothing);
      expect(find.text('Product'), findsNWidgets(2));
      await tester.tap(find.byIcon(Icons.close_rounded).last);
      await tester.pumpAndSettle();
      expect(find.byType(EditableText), findsNothing);
      expect(find.byIcon(Icons.add_rounded), findsOneWidget);
      FocusManager.instance.primaryFocus?.unfocus();
      await tester.pumpAndSettle();
      expect(find.byType(EditableText), findsNothing);
      expect(find.byIcon(Icons.add_rounded), findsOneWidget);
      expect(find.text('Design'), findsOneWidget);
      await tester.tap(find.byIcon(Icons.search_rounded).first);
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(EditableText), 'Product');
      await tester.pumpAndSettle();
      await tester.tap(find.byIcon(Icons.close_rounded).last);
      await tester.pumpAndSettle();
      expect(find.byType(EditableText), findsNothing);
      expect(find.byIcon(Icons.add_rounded), findsOneWidget);
      await tester.tap(find.byIcon(Icons.search_rounded).first);
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(EditableText), '   ');
      await tester.pumpAndSettle();
      FocusManager.instance.primaryFocus?.unfocus();
      await tester.pumpAndSettle();
      expect(find.byType(EditableText), findsNothing);
      expect(find.byIcon(Icons.add_rounded), findsOneWidget);
    });

    testWidgets('selects the workspace represented by a filtered result', (
      tester,
    ) async {
      const exocorpseWorkspace = Workspace(
        id: 'ws_exocorpse',
        name: 'Exocorpse',
      );
      const state = WorkspaceState(
        status: WorkspaceStatus.loaded,
        workspaces: [freeWorkspace, exocorpseWorkspace, proWorkspace],
        currentWorkspace: freeWorkspace,
      );
      when(() => workspaceCubit.state).thenReturn(state);
      whenListen(
        workspaceCubit,
        const Stream<WorkspaceState>.empty(),
        initialState: state,
      );
      when(
        () => workspaceCubit.selectWorkspace(exocorpseWorkspace),
      ).thenAnswer((_) async {});

      await tester.pumpApp(
        BlocProvider<WorkspaceCubit>.value(
          value: workspaceCubit,
          child: Builder(
            builder: (context) => Scaffold(
              body: TextButton(
                onPressed: () => showWorkspacePickerSheet(context),
                child: const Text('Open picker'),
              ),
            ),
          ),
        ),
      );

      await tester.tap(find.text('Open picker'));
      await tester.pump(const Duration(milliseconds: 250));
      await tester.tap(find.byIcon(Icons.search_rounded).first);
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(EditableText), 'Exocorpse');
      await tester.pumpAndSettle();
      final exocorpseResult = find.ancestor(
        of: find.text('Exocorpse').last,
        matching: find.byType(InkWell),
      );
      await tester.tap(exocorpseResult.first);
      await tester.pumpAndSettle();

      verify(
        () => workspaceCubit.selectWorkspace(exocorpseWorkspace),
      ).called(1);
      verifyNever(() => workspaceCubit.selectWorkspace(freeWorkspace));
    });

    for (final mode in WorkspacePickerMode.values) {
      testWidgets('selects stable ID after sorting and refresh in $mode', (
        tester,
      ) async {
        const original = Workspace(id: 'first', name: 'Zulu');
        const duplicateA = Workspace(id: 'duplicate_a', name: 'Alpha');
        const duplicateB = Workspace(id: 'duplicate_b', name: 'Alpha');
        const updatedB = Workspace(
          id: 'duplicate_b',
          name: 'Alpha',
          tier: workspaceTierPro,
        );
        const initial = WorkspaceState(
          status: WorkspaceStatus.loaded,
          workspaces: [original, duplicateB, duplicateA],
          currentWorkspace: original,
        );
        final updates = StreamController<WorkspaceState>();
        addTearDown(updates.close);
        whenListen(workspaceCubit, updates.stream, initialState: initial);
        when(
          () => workspaceCubit.selectWorkspace(updatedB),
        ).thenAnswer((_) async {});
        when(
          () => workspaceCubit.setDefaultWorkspace(updatedB),
        ).thenAnswer((_) async {});
        await tester.pumpApp(
          BlocProvider<WorkspaceCubit>.value(
            value: workspaceCubit,
            child: Builder(
              builder: (context) => Scaffold(
                body: TextButton(
                  onPressed: () =>
                      showWorkspacePickerSheet(context, mode: mode),
                  child: const Text('Open picker'),
                ),
              ),
            ),
          ),
        );
        await tester.tap(find.text('Open picker'));
        await tester.pump(const Duration(milliseconds: 250));
        await tester.tap(find.byIcon(Icons.search_rounded).first);
        await tester.pumpAndSettle();
        await tester.enterText(find.byType(EditableText), 'Alpha');
        await tester.pumpAndSettle();
        updates.add(
          initial.copyWith(workspaces: [duplicateA, original, updatedB]),
        );
        await tester.pumpAndSettle();
        FocusManager.instance.primaryFocus?.unfocus();
        await tester.pumpAndSettle();
        expect(find.text('Zulu'), findsNothing);
        final result = find.byKey(
          const ValueKey('workspace-result-duplicate_b'),
        );
        await tester.ensureVisible(result);
        await tester.tap(result);
        await tester.pumpAndSettle();
        if (mode == WorkspacePickerMode.current) {
          verify(() => workspaceCubit.selectWorkspace(updatedB)).called(1);
          verifyNever(() => workspaceCubit.setDefaultWorkspace(updatedB));
        } else {
          verify(() => workspaceCubit.setDefaultWorkspace(updatedB)).called(1);
          verifyNever(() => workspaceCubit.selectWorkspace(updatedB));
        }
        verifyNever(() => workspaceCubit.selectWorkspace(original));
        verifyNever(() => workspaceCubit.selectWorkspace(duplicateA));
      });
    }
    testWidgets(
      'narrow fullscreen picker supports large text, keyboard and close',
      (tester) async {
        tester.view.physicalSize = const Size(320, 568);
        tester.view.devicePixelRatio = 1;
        tester.platformDispatcher.textScaleFactorTestValue = 2;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
        const state = WorkspaceState(
          status: WorkspaceStatus.loaded,
          workspaces: [proWorkspace, enterpriseWorkspace, freeWorkspace],
          visibilityResolved: true,
          visibilityStatus: WorkspaceStatus.loaded,
          visibilityError: 'offline',
        );
        when(() => workspaceCubit.hasAuthenticatedActor).thenReturn(true);
        when(() => workspaceCubit.state).thenReturn(state);
        whenListen(
          workspaceCubit,
          const Stream<WorkspaceState>.empty(),
          initialState: state,
        );
        await tester.pumpApp(
          BlocProvider.value(
            value: workspaceCubit,
            child: Builder(
              builder: (context) => Scaffold(
                body: TextButton(
                  onPressed: () => showWorkspacePickerSheet(context),
                  child: const Text('Open picker'),
                ),
              ),
            ),
          ),
        );
        await tester.tap(find.text('Open picker'));
        await tester.pumpAndSettle();
        expect(find.byType(Dialog), findsOneWidget);
        expect(find.byType(FloatingActionButton), findsNWidgets(2));
        expect(tester.takeException(), isNull);
        await tester.tap(find.byIcon(Icons.search_rounded).last);
        await tester.pumpAndSettle();
        tester.view.viewInsets = const FakeViewPadding(bottom: 300);
        addTearDown(tester.view.resetViewInsets);
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        expect(find.byTooltip('Close workspace picker'), findsOneWidget);
        await tester.tap(find.byTooltip('Close workspace picker'));
        await tester.pumpAndSettle();
        expect(find.byType(Dialog), findsNothing);
        expect(find.text('Open picker'), findsOneWidget);
      },
    );
    testWidgets(
      'Settings row opens private restore without selecting a scope',
      (tester) async {
        const state = WorkspaceState(
          status: WorkspaceStatus.loaded,
          workspaces: [proWorkspace, freeWorkspace],
          hiddenWorkspaceIds: ['ws_1'],
          visibilityResolved: true,
          visibilityStatus: WorkspaceStatus.loaded,
        );
        when(() => workspaceCubit.hasAuthenticatedActor).thenReturn(true);
        when(() => workspaceCubit.state).thenReturn(state);
        when(
          () => workspaceCubit.setWorkspaceHidden('ws_1', hidden: false),
        ).thenAnswer((_) async {});
        whenListen(
          workspaceCubit,
          const Stream<WorkspaceState>.empty(),
          initialState: state,
        );
        await tester.pumpApp(
          BlocProvider.value(
            value: workspaceCubit,
            child: const HiddenWorkspacesSettingsRow(),
          ),
        );
        await tester.tap(find.text('Hidden workspaces'));
        await tester.pumpAndSettle();
        expect(find.text('Product'), findsOneWidget);
        expect(find.text('Design'), findsNothing);
        await tester.tap(find.byTooltip('Restore: Product'));
        await tester.pumpAndSettle();
        verify(
          () => workspaceCubit.setWorkspaceHidden('ws_1', hidden: false),
        ).called(1);
        verifyNever(() => workspaceCubit.selectWorkspace(proWorkspace));
        verifyNever(() => workspaceCubit.setDefaultWorkspace(proWorkspace));
        await tester.binding.handlePopRoute();
        await tester.pumpAndSettle();
        expect(find.byType(Dialog), findsNothing);
      },
    );
  });
}
