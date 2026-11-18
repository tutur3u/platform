import 'dart:ui' as ui;

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/theme/appearance/brand_accents.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/models/workspace_limits.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/features/workspace/widgets/hidden_workspaces_settings_row.dart';
import 'package:mobile/features/workspace/widgets/workspace_picker_body.dart';
import 'package:mobile/features/workspace/widgets/workspace_picker_sheet.dart';
import 'package:mobile/features/workspace/widgets/workspace_visibility_sheet.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/helpers.dart';

class _Workspaces extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

const _personal = Workspace(
  id: 'personal_ws',
  name: 'Alex Nguyen',
  personal: true,
);
const _product = Workspace(id: 'ws_1', name: 'Product', tier: workspaceTierPro);
const _design = Workspace(id: 'ws_2', name: 'Design');
const _ops = Workspace(id: 'ws_3', name: 'Ops');

const _loaded = WorkspaceState(
  status: WorkspaceStatus.loaded,
  workspaces: [_ops, _personal, _product, _design],
  currentWorkspace: _product,
  defaultWorkspace: _personal,
);

List<Workspace> _teams(int count) => [
  for (var i = 0; i < count; i++)
    Workspace(id: 'team-$i', name: 'Team ${i.toString().padLeft(2, '0')}'),
];

Finder _row(String id) => find.byKey(workspacePickerRowKey(id));

const ValueKey<String> _create = ValueKey('workspace-picker-create');
const ValueKey<String> _manage = ValueKey('workspace-picker-manage');

/// Opens the picker from a page on a nested navigator, as in the shell.
Future<_Workspaces> _open(
  WidgetTester tester,
  WorkspaceState state, {
  Brightness brightness = Brightness.light,
  ShellChromeActionsCubit? chrome,
  WorkspacePickerMode mode = WorkspacePickerMode.current,
  bool authenticated = false,
  Size size = const Size(390, 844),
  bool settle = true,
}) async {
  tester.view
    ..physicalSize = size
    ..devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final cubit = _Workspaces();
  when(() => cubit.hasAuthenticatedActor).thenReturn(authenticated);
  when(cubit.refreshHiddenWorkspaces).thenAnswer((_) async {});
  when(() => cubit.selectWorkspace(any())).thenAnswer((_) async {});
  when(() => cubit.setDefaultWorkspace(any())).thenAnswer((_) async {});
  when(() => cubit.state).thenReturn(state);
  whenListen(cubit, const Stream<WorkspaceState>.empty(), initialState: state);
  await tester.pumpThemedHome(
    Navigator(
      onGenerateRoute: (_) => MaterialPageRoute<void>(
        builder: (context) => Scaffold(
          body: Center(
            child: TextButton(
              onPressed: () => showWorkspacePickerSheet(context, mode: mode),
              child: const Text('Open picker'),
            ),
          ),
        ),
      ),
    ),
    brightness: brightness,
    wrap: (app) => MultiBlocProvider(
      providers: [
        BlocProvider<WorkspaceCubit>.value(value: cubit),
        if (chrome != null)
          BlocProvider<ShellChromeActionsCubit>.value(value: chrome),
      ],
      child: app,
    ),
  );
  await tester.tap(find.text('Open picker'));
  if (settle) {
    await tester.pumpAndSettle();
  } else {
    await tester.pump(const Duration(milliseconds: 400));
  }
  return cubit;
}

List<double> _tops(WidgetTester tester, List<String> ids) => [
  for (final id in ids) tester.getTopLeft(_row(id)).dy,
];

void _expectAscending(List<double> values) {
  for (var i = 1; i < values.length; i++) {
    expect(values[i], greaterThan(values[i - 1]), reason: 'row $i');
  }
}

/// Asserts [row] is a selected choice in a radio group that a screen reader
/// can activate, announced as [label].
void _expectSelectedChoice(WidgetTester tester, Finder row, String label) {
  final node = tester.getSemantics(row);
  final data = node.getSemanticsData();
  expect(data.label, label);
  expect(data.hasAction(ui.SemanticsAction.tap), isTrue);
  expect(node.flagsCollection.isButton, isTrue);
  expect(node.flagsCollection.isInMutuallyExclusiveGroup, isTrue);
  expect(node.flagsCollection.isSelected, ui.Tristate.isTrue);
}

void main() {
  setUpAll(() => registerFallbackValue(_product));

  testWidgets('the current workspace is the checked first row', (tester) async {
    await _open(tester, _loaded);
    _expectSelectedChoice(tester, _row('ws_1'), 'Product, Pro');
    expect(find.byIcon(AppIcons.check), findsOneWidget);
    // Without recent use, the rest keep their listed order.
    _expectAscending(_tops(tester, ['ws_1', 'ws_3', 'personal_ws', 'ws_2']));
  });

  testWidgets('the rest follow by recent use', (tester) async {
    await _open(
      tester,
      _loaded.copyWith(recentWorkspaceIds: ['ws_2', 'ws_1', 'personal_ws']),
    );
    _expectAscending(_tops(tester, ['ws_1', 'ws_2', 'personal_ws', 'ws_3']));
  });

  testWidgets('Pro has an outlined marker and Free has none', (tester) async {
    await _open(
      tester,
      const WorkspaceState(
        status: WorkspaceStatus.loaded,
        workspaces: [_product, _design],
        currentWorkspace: _design,
      ),
    );
    expect(
      find.descendant(of: _row('ws_1'), matching: find.text('Pro')),
      findsOneWidget,
    );
    expect(find.text('Free'), findsNothing);
    _expectSelectedChoice(tester, _row('ws_2'), 'Design');
  });

  testWidgets('the filter appears only above eight workspaces', (tester) async {
    final eight = _teams(8);
    await _open(
      tester,
      WorkspaceState(
        status: WorkspaceStatus.loaded,
        workspaces: eight,
        currentWorkspace: eight.first,
      ),
    );
    expect(find.byKey(workspacePickerFilterKey), findsNothing);
    expect(find.byType(EditableText), findsNothing);
  });

  testWidgets('above eight, the filter narrows rows and can be cleared', (
    tester,
  ) async {
    final nine = _teams(9);
    final cubit = await _open(
      tester,
      WorkspaceState(
        status: WorkspaceStatus.loaded,
        workspaces: nine,
        currentWorkspace: nine.first,
      ),
    );
    expect(find.byKey(workspacePickerFilterKey), findsOneWidget);
    await tester.enterText(find.byType(EditableText), 'team 07');
    await tester.pumpAndSettle();
    expect(_row('team-7'), findsOneWidget);
    expect(_row('team-0'), findsNothing);

    await tester.enterText(find.byType(EditableText), 'nothing like this');
    await tester.pumpAndSettle();
    expect(
      find.byKey(const ValueKey('workspace-picker-no-results')),
      findsOneWidget,
    );
    await tester.tap(find.text('Clear search'));
    await tester.pumpAndSettle();
    expect(_row('team-0'), findsOneWidget);

    await tester.enterText(find.byType(EditableText), 'team 05');
    await tester.pumpAndSettle();
    await tester.tap(_row('team-5'));
    await tester.pumpAndSettle();
    verify(() => cubit.selectWorkspace(nine[5])).called(1);
  });

  testWidgets('selecting a row switches workspace and closes', (tester) async {
    final cubit = await _open(tester, _loaded);
    await tester.tap(_row('ws_3'));
    await tester.pumpAndSettle();
    verify(() => cubit.selectWorkspace(_ops)).called(1);
    verifyNever(() => cubit.setDefaultWorkspace(any()));
    expect(find.byType(AppSheetScaffold), findsNothing);
  });

  testWidgets('default mode checks the default and saves it on tap', (
    tester,
  ) async {
    final cubit = await _open(
      tester,
      _loaded,
      mode: WorkspacePickerMode.defaultWorkspace,
    );
    expect(find.byKey(_manage), findsNothing);
    expect(find.text('Default workspace'), findsWidgets);
    _expectSelectedChoice(tester, _row('personal_ws'), 'Alex Nguyen');
    _expectAscending(_tops(tester, ['personal_ws', 'ws_3', 'ws_1', 'ws_2']));
    await tester.tap(_row('ws_2'));
    await tester.pumpAndSettle();
    verify(() => cubit.setDefaultWorkspace(_design)).called(1);
    verifyNever(() => cubit.selectWorkspace(any()));
  });

  testWidgets('Create and Manage are plain rows after the workspaces', (
    tester,
  ) async {
    final chrome = ShellChromeActionsCubit();
    addTearDown(chrome.close);
    await _open(tester, _loaded, chrome: chrome);
    final last = tester.getRect(_row('ws_2')).bottom;
    expect(tester.getRect(find.byKey(_create)).top, greaterThan(last));
    expect(
      tester.getRect(find.byKey(_manage)).top,
      greaterThan(tester.getRect(find.byKey(_create)).top),
    );
    expect(find.byType(AppButton), findsNothing);

    await tester.tap(find.byKey(_manage));
    await tester.pumpAndSettle();
    expect(find.byType(WorkspacePickerSheet), findsNothing);
    expect(find.byType(WorkspaceVisibilitySheet), findsOneWidget);
    final back = chrome.state.backForLocation('/test');
    expect(back, isNotNull);
    await back!();
    await tester.pumpAndSettle();
    expect(find.byType(WorkspaceVisibilitySheet), findsNothing);
  });

  testWidgets('Create is disabled at the workspace limit', (tester) async {
    await _open(
      tester,
      _loaded.copyWith(
        limits: const WorkspaceLimits(
          canCreate: false,
          currentCount: 4,
          limit: 4,
        ),
      ),
    );
    expect(find.text('You have reached the workspace limit'), findsOneWidget);
    expect(tester.widget<AppOptionTile>(find.byKey(_create)).onTap, isNull);
  });

  for (final brightness in Brightness.values) {
    testWidgets('identity tiles use the stable brand colour per id in '
        '${brightness.name}', (tester) async {
      await _open(tester, _loaded, brightness: brightness);
      for (final id in ['ws_2', 'ws_3', 'personal_ws']) {
        final fills = tester
            .widgetList<ColoredBox>(
              find.descendant(of: _row(id), matching: find.byType(ColoredBox)),
            )
            .map((box) => box.color);
        expect(
          fills,
          contains(BrandAccents.forKey(id).fill(brightness)),
          reason: id,
        );
      }
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('first visibility load shows skeleton rows', (tester) async {
    await _open(
      tester,
      _loaded.copyWith(visibilityStatus: WorkspaceStatus.loading),
      authenticated: true,
      settle: false,
    );
    expect(find.byType(AppSkeletonRows), findsOneWidget);
    expect(_row('ws_3'), findsNothing);
  });

  testWidgets('a preference failure warns and keeps switching available', (
    tester,
  ) async {
    final cubit = await _open(
      tester,
      const WorkspaceState(
        status: WorkspaceStatus.loaded,
        workspaces: [_product, _design],
        visibilityStatus: WorkspaceStatus.error,
        visibilityError: 'offline',
      ),
      authenticated: true,
    );
    expect(
      find.text(
        'Workspace visibility preferences are unavailable. '
        'Saved hidden choices are kept.',
      ),
      findsOneWidget,
    );
    clearInteractions(cubit);
    await tester.tap(find.text('Retry'));
    verify(cubit.refreshHiddenWorkspaces).called(1);
    await tester.tap(_row('ws_2'));
    await tester.pumpAndSettle();
    verify(() => cubit.selectWorkspace(_design)).called(1);
  });

  testWidgets('the normal picker keeps hidden workspaces out', (tester) async {
    await _open(
      tester,
      const WorkspaceState(
        status: WorkspaceStatus.loaded,
        workspaces: [_product, _design],
        hiddenWorkspaceIds: ['ws_1'],
        visibilityResolved: true,
        visibilityStatus: WorkspaceStatus.loaded,
      ),
      authenticated: true,
    );
    expect(_row('ws_1'), findsNothing);
    expect(_row('ws_2'), findsOneWidget);
    expect(find.byTooltip('Restore: Product'), findsNothing);
  });

  testWidgets('the hidden list restores without selecting', (tester) async {
    tester.view
      ..physicalSize = const Size(390, 844)
      ..devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    const state = WorkspaceState(
      status: WorkspaceStatus.loaded,
      workspaces: [_product, _design],
      hiddenWorkspaceIds: ['ws_1'],
      visibilityResolved: true,
      visibilityStatus: WorkspaceStatus.loaded,
    );
    final cubit = _Workspaces();
    when(() => cubit.hasAuthenticatedActor).thenReturn(true);
    when(cubit.refreshHiddenWorkspaces).thenAnswer((_) async {});
    when(() => cubit.state).thenReturn(state);
    when(
      () => cubit.setWorkspaceHidden('ws_1', hidden: false),
    ).thenAnswer((_) async {});
    whenListen(
      cubit,
      const Stream<WorkspaceState>.empty(),
      initialState: state,
    );
    await tester.pumpApp(
      BlocProvider<WorkspaceCubit>.value(
        value: cubit,
        child: const HiddenWorkspacesSettingsRow(),
      ),
    );
    await tester.tap(find.text('Hidden workspaces'));
    await tester.pumpAndSettle();
    expect(find.text('Product'), findsOneWidget);
    expect(find.text('Design'), findsNothing);
    await tester.tap(find.byTooltip('Restore: Product'));
    await tester.pumpAndSettle();
    verify(() => cubit.setWorkspaceHidden('ws_1', hidden: false)).called(1);
    verifyNever(() => cubit.selectWorkspace(any()));
    expect(find.byKey(_create), findsNothing);
  });

  testWidgets('a long list builds lazily and scrolls to the end rows', (
    tester,
  ) async {
    final teams = _teams(40);
    await _open(
      tester,
      WorkspaceState(
        status: WorkspaceStatus.loaded,
        workspaces: teams,
        currentWorkspace: teams.first,
      ),
    );
    expect(_row('team-39'), findsNothing);
    final scroll = find
        .descendant(
          of: find.byType(CustomScrollView),
          matching: find.byType(Scrollable),
        )
        .first;
    await tester.scrollUntilVisible(
      find.byKey(_manage),
      300,
      scrollable: scroll,
    );
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });

  testWidgets('a narrow sheet supports large text and closes', (tester) async {
    tester.platformDispatcher.textScaleFactorTestValue = 2;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    await _open(tester, _loaded, size: const Size(320, 568));
    expect(tester.takeException(), isNull);
    await tester.tap(find.byKey(const ValueKey('app-sheet-close')));
    await tester.pumpAndSettle();
    expect(find.byType(AppSheetScaffold), findsNothing);
  });
}
