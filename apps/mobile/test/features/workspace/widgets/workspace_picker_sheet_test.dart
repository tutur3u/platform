import 'dart:async';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/models/workspace_limits.dart';
import 'package:mobile/features/shell/view/mobile_section_app_bar.dart';
import 'package:mobile/features/shell/view/shell_brand_title.dart';
import 'package:mobile/features/shell/view/shell_dock_action_button.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/features/workspace/widgets/hidden_workspaces_settings_row.dart';
import 'package:mobile/features/workspace/widgets/workspace_picker_sheet.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

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
        expect(find.byType(FloatingActionButton), findsNothing);
        expect(find.byType(ShellDockActionButton), findsNWidgets(2));
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

    Future<void> openPicker(
      WidgetTester tester,
      WorkspaceState state, {
      Stream<WorkspaceState>? stream,
    }) async {
      when(() => workspaceCubit.state).thenReturn(state);
      whenListen(
        workspaceCubit,
        stream ?? const Stream<WorkspaceState>.empty(),
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
    }

    testWidgets(
      'explains the disabled creation action at the workspace limit',
      (tester) async {
        await openPicker(
          tester,
          const WorkspaceState(
            status: WorkspaceStatus.loaded,
            workspaces: [proWorkspace, freeWorkspace],
            limits: WorkspaceLimits(
              canCreate: false,
              currentCount: 2,
              limit: 2,
            ),
          ),
        );
        expect(find.text('2 of 2 workspaces used'), findsOneWidget);
        expect(
          find.text('You have reached the workspace limit'),
          findsOneWidget,
        );
        final add = tester.widget<FilledButton>(
          find.descendant(
            of: find.byType(ShellDockActionButton).last,
            matching: find.byType(FilledButton),
          ),
        );
        expect(add.onPressed, isNull);
      },
    );
    testWidgets('shows one private load error and an accessible retry', (
      tester,
    ) async {
      when(() => workspaceCubit.hasAuthenticatedActor).thenReturn(true);
      await openPicker(
        tester,
        const WorkspaceState(
          status: WorkspaceStatus.loaded,
          workspaces: [proWorkspace],
          visibilityStatus: WorkspaceStatus.error,
          visibilityError: 'offline',
        ),
      );
      expect(
        find.text(
          'Unable to refresh Hidden workspaces. Your saved list is kept.',
        ),
        findsOneWidget,
      );
      clearInteractions(workspaceCubit);
      await tester.tap(find.text('Retry'));
      verify(() => workspaceCubit.refreshHiddenWorkspaces()).called(1);
      expect(find.text('Product'), findsNothing);
    });
    testWidgets('recovers all-Hidden choices in the same fullscreen route '
        'and returns in place', (tester) async {
      const state = WorkspaceState(
        status: WorkspaceStatus.loaded,
        workspaces: [proWorkspace],
        hiddenWorkspaceIds: ['ws_1'],
        visibilityResolved: true,
        visibilityStatus: WorkspaceStatus.loaded,
      );
      final updates = StreamController<WorkspaceState>();
      addTearDown(updates.close);
      when(() => workspaceCubit.hasAuthenticatedActor).thenReturn(true);
      when(
        () => workspaceCubit.setWorkspaceHidden('ws_1', hidden: false),
      ).thenAnswer((_) async {
        updates.add(state.copyWith(hiddenWorkspaceIds: []));
      });
      await openPicker(tester, state, stream: updates.stream);
      await tester.tap(find.text('Hidden workspaces'));
      await tester.pumpAndSettle();
      expect(find.byType(Dialog), findsOneWidget);
      expect(find.text('Product'), findsOneWidget);
      await tester.tap(find.byTooltip('Restore: Product'));
      await tester.pumpAndSettle();
      expect(find.byType(Dialog), findsOneWidget);
      await tester.tap(find.byTooltip('Back'));
      await tester.pumpAndSettle();
      expect(find.text('Product'), findsOneWidget);
      verifyNever(() => workspaceCubit.selectWorkspace(proWorkspace));
      await tester.binding.handlePopRoute();
      await tester.pumpAndSettle();
      expect(find.byType(Dialog), findsNothing);
    });
    testWidgets(
      'save error keeps the whole viewport scrollable to the last row',
      (tester) async {
        tester.view.physicalSize = const Size(320, 640);
        tester.view.padding = const FakeViewPadding(top: 44, bottom: 34);
        tester.view.viewPadding = const FakeViewPadding(top: 44, bottom: 34);
        addTearDown(tester.view.resetPadding);
        addTearDown(tester.view.resetViewPadding);
        tester.view.devicePixelRatio = 1;
        tester.platformDispatcher.textScaleFactorTestValue = 1.5;
        addTearDown(tester.view.resetPhysicalSize);
        addTearDown(tester.view.resetDevicePixelRatio);
        addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
        when(() => workspaceCubit.hasAuthenticatedActor).thenReturn(true);
        final workspaces = List.generate(
          20,
          (index) => Workspace(
            id: 'synthetic-$index',
            name:
                'Synthetic team ${index.toString().padLeft(2, '0')} '
                'with a long workspace label',
          ),
        );
        await openPicker(
          tester,
          WorkspaceState(
            status: WorkspaceStatus.loaded,
            workspaces: workspaces,
            visibilityStatus: WorkspaceStatus.loaded,
            visibilityResolved: true,
            visibilityError: 'synthetic offline failure',
          ),
        );
        expect(
          find.text('Unable to save this change. Try again when connected.'),
          findsOneWidget,
        );
        expect(find.text('Retry'), findsOneWidget);
        expect(tester.getRect(find.byType(Dialog)).bottom, 640);
        expect(tester.getRect(find.byType(shad.AppBar)).top, 44);
        final scroll = find.byKey(const ValueKey('workspace-picker-scroll'));
        expect(
          tester.getRect(scroll).bottom,
          closeTo(tester.getRect(find.byType(Dialog)).bottom, 1),
        );
        await tester.scrollUntilVisible(
          find.byKey(const ValueKey('workspace-result-synthetic-19')),
          250,
          scrollable: find.descendant(
            of: scroll,
            matching: find.byType(Scrollable),
          ),
        );
        await tester.pumpAndSettle();
        expect(tester.takeException(), isNull);
        final last = tester.getRect(
          find.byKey(const ValueKey('workspace-result-synthetic-19')),
        );
        expect(
          last.bottom,
          lessThan(
            tester.getRect(find.byType(ShellDockActionButton).first).top,
          ),
        );
      },
    );

    for (final brightness in [Brightness.light, Brightness.dark]) {
      testWidgets('fullscreen shell header, action styling and row accents '
          'in $brightness', (tester) async {
        tester.platformDispatcher.platformBrightnessTestValue = brightness;
        addTearDown(tester.platformDispatcher.clearPlatformBrightnessTestValue);
        await openPicker(
          tester,
          const WorkspaceState(
            status: WorkspaceStatus.loaded,
            workspaces: [
              Workspace(
                id: 'synthetic-personal',
                name: 'Synthetic personal',
                personal: true,
              ),
              Workspace(
                id: '00000000-0000-0000-0000-000000000000',
                name: 'Synthetic system',
              ),
              proWorkspace,
            ],
            visibilityResolved: true,
            visibilityStatus: WorkspaceStatus.loaded,
          ),
        );
        final bar = tester.widget<shad.AppBar>(find.byType(shad.AppBar));
        final barContext = tester.element(find.byType(shad.AppBar));
        expect(bar.height, mobileSectionAppBarHeightFor(barContext));
        expect(bar.padding, mobileSectionAppBarPadding);
        expect(find.byType(ShellBrandTitle), findsOneWidget);
        final logo = tester.widget<Image>(
          find.descendant(
            of: find.byType(ShellBrandTitle),
            matching: find.byType(Image),
          ),
        );
        expect(logo.width, 28);
        expect(logo.height, 28);
        expect(find.byType(FloatingActionButton), findsNothing);
        final search = tester.widget<FilledButton>(
          find.descendant(
            of: find.byType(ShellDockActionButton).first,
            matching: find.byType(FilledButton),
          ),
        );
        final scheme = Theme.of(barContext).colorScheme;
        expect(search.style!.backgroundColor!.resolve({}), scheme.onSurface);
        expect(search.style!.foregroundColor!.resolve({}), scheme.surface);
        expect(search.style!.shape!.resolve({}), isA<StadiumBorder>());
        final rowColors =
            [
                  'synthetic-personal',
                  '00000000-0000-0000-0000-000000000000',
                  'ws_1',
                ]
                .map(
                  (id) => tester
                      .widget<Material>(
                        find
                            .descendant(
                              of: find.byKey(ValueKey('workspace-result-$id')),
                              matching: find.byType(Material),
                            )
                            .first,
                      )
                      .color,
                )
                .toSet();
        expect(rowColors.length, 3);
        expect(rowColors, isNot(contains(scheme.surfaceContainerHigh)));
        expect(tester.takeException(), isNull);
      });
    }
  });
}
