import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/theme/appearance/brand_accents.dart';
import 'package:mobile/core/ui/kit/kit.dart';
import 'package:mobile/core/ui/ui.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/features/workspace/widgets/workspace_current_card.dart';
import 'package:mobile/features/workspace/widgets/workspace_picker_sheet.dart';
import 'package:mocktail/mocktail.dart';

import '../../../helpers/helpers.dart';

class _Workspaces extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

const _personal = Workspace(
  id: 'personal_ws',
  name: 'Alex Nguyen',
  personal: true,
);
const _product = Workspace(id: 'ws_1', name: 'Product');
const _design = Workspace(id: 'ws_2', name: 'Design');
const _ops = Workspace(id: 'ws_3', name: 'Ops');

/// Opens the picker from a page on a nested navigator, as in the shell.
/// With [chrome] the sheet registers its search with the shell chrome.
Future<_Workspaces> _open(
  WidgetTester tester,
  WorkspaceState state, {
  Brightness brightness = Brightness.light,
  ShellChromeActionsCubit? chrome,
  WorkspacePickerMode mode = WorkspacePickerMode.current,
}) async {
  tester.view
    ..physicalSize = const Size(390, 844)
    ..devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final cubit = _Workspaces();
  when(() => cubit.hasAuthenticatedActor).thenReturn(false);
  when(cubit.refreshHiddenWorkspaces).thenAnswer((_) async {});
  when(() => cubit.selectWorkspace(any())).thenAnswer((_) async {});
  when(() => cubit.setDefaultWorkspace(any())).thenAnswer((_) async {});
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
  await tester.pumpAndSettle();
  return cubit;
}

Finder _row(String id) => find.byKey(ValueKey('workspace-result-$id'));

void main() {
  setUpAll(() => registerFallbackValue(_product));

  const loaded = WorkspaceState(
    status: WorkspaceStatus.loaded,
    workspaces: [_ops, _personal, _product, _design],
    currentWorkspace: _product,
    defaultWorkspace: _personal,
  );

  testWidgets('pins the current workspace above the grouped results', (
    tester,
  ) async {
    await _open(tester, loaded);

    final pinned = find.byType(WorkspaceCurrentCard);
    expect(pinned, findsOneWidget);
    expect(find.text('Current workspace'), findsOneWidget);
    expect(
      tester.getSemantics(pinned),
      matchesSemantics(
        hasSelectedState: true,
        isSelected: true,
        isButton: true,
        hasTapAction: true,
        label: 'Current workspace, Product',
      ),
    );
    // Pinned, so not repeated in its section.
    expect(_row('ws_1'), findsNothing);

    final headers = tester
        .widgetList<AppSectionHeader>(find.byType(AppSectionHeader))
        .map((header) => (header.title, header.count))
        .toList();
    expect(headers, [('Personal', 1), ('Team workspaces', 2)]);
    final pinnedBottom = tester.getRect(pinned).bottom;
    final personalTop = tester.getRect(find.text('Personal').first).top;
    final teamTop = tester.getRect(find.text('Team workspaces')).top;
    expect(pinnedBottom, lessThan(personalTop));
    expect(tester.getRect(_row('personal_ws')).bottom, lessThan(teamTop));
    // Team rows are sorted by name.
    expect(
      tester.getRect(_row('ws_2')).top,
      lessThan(tester.getRect(_row('ws_3')).top),
    );
  });

  testWidgets('search filters rows and offers to clear an empty result', (
    tester,
  ) async {
    await _open(tester, loaded);

    await tester.enterText(find.byType(EditableText), 'des');
    await tester.pumpAndSettle();
    expect(find.byType(WorkspaceCurrentCard), findsNothing);
    expect(_row('ws_2'), findsOneWidget);
    expect(_row('ws_3'), findsNothing);
    expect(_row('personal_ws'), findsNothing);

    await tester.enterText(find.byType(EditableText), 'nothing like this');
    await tester.pumpAndSettle();
    final empty = find.byKey(const ValueKey('workspace-picker-no-results'));
    expect(empty, findsOneWidget);
    expect(find.text('No matching results'), findsOneWidget);
    await tester.tap(find.text('Clear search'));
    await tester.pumpAndSettle();
    expect(empty, findsNothing);
    expect(find.byType(WorkspaceCurrentCard), findsOneWidget);
    expect(_row('ws_3'), findsOneWidget);
  });

  testWidgets('a row switches through the same cubit call and closes', (
    tester,
  ) async {
    final cubit = await _open(tester, loaded);

    await tester.tap(_row('ws_3'));
    await tester.pumpAndSettle();
    verify(() => cubit.selectWorkspace(_ops)).called(1);
    verifyNever(() => cubit.setDefaultWorkspace(any()));
    expect(find.byType(AppSheetScaffold), findsNothing);
  });

  testWidgets('default mode pins the default and saves it on tap', (
    tester,
  ) async {
    final cubit = await _open(
      tester,
      loaded,
      mode: WorkspacePickerMode.defaultWorkspace,
    );
    expect(find.text('Default workspace'), findsWidgets);
    expect(
      find.byKey(const ValueKey('workspace-current-personal_ws')),
      findsOneWidget,
    );
    // The current workspace is listed with its badge instead.
    expect(_row('ws_1'), findsOneWidget);
    await tester.tap(_row('ws_2'));
    await tester.pumpAndSettle();
    verify(() => cubit.setDefaultWorkspace(_design)).called(1);
    verifyNever(() => cubit.selectWorkspace(any()));
  });

  for (final brightness in Brightness.values) {
    testWidgets('identity tiles use the stable brand colour per id in '
        '${brightness.name}', (tester) async {
      await _open(tester, loaded, brightness: brightness);
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
      expect(find.text('AN'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('first visibility load shows skeleton rows', (tester) async {
    tester.view
      ..physicalSize = const Size(390, 844)
      ..devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final cubit = _Workspaces();
    when(() => cubit.hasAuthenticatedActor).thenReturn(true);
    when(cubit.refreshHiddenWorkspaces).thenAnswer((_) async {});
    whenListen(
      cubit,
      const Stream<WorkspaceState>.empty(),
      initialState: loaded.copyWith(visibilityStatus: WorkspaceStatus.loading),
    );
    await tester.pumpThemedHome(
      Builder(
        builder: (context) => TextButton(
          onPressed: () => showWorkspacePickerSheet(context),
          child: const Text('Open picker'),
        ),
      ),
      wrap: (app) =>
          BlocProvider<WorkspaceCubit>.value(value: cubit, child: app),
    );
    await tester.tap(find.text('Open picker'));
    await tester.pump(const Duration(milliseconds: 400));
    expect(find.byType(AppSkeletonRows), findsOneWidget);
    expect(_row('ws_3'), findsNothing);
  });

  testWidgets('inside the shell, search is the dock action', (tester) async {
    final chrome = ShellChromeActionsCubit();
    addTearDown(chrome.close);
    await _open(tester, loaded, chrome: chrome);

    expect(find.byType(AppSearchField), findsNothing);
    final action = chrome.state.registrations.values
        .expand((registration) => registration.actions)
        .singleWhere((spec) => spec.id.endsWith('/search'));
    expect(action.inDock, isTrue);
    expect(action.searchHint, 'Search workspaces');
  });

  testWidgets('a long list builds lazily and scrolls clear of the footer', (
    tester,
  ) async {
    final teams = [
      for (var i = 0; i < 40; i++)
        Workspace(id: 'team-$i', name: 'Team ${i.toString().padLeft(2, '0')}'),
    ];
    await _open(
      tester,
      WorkspaceState(
        status: WorkspaceStatus.loaded,
        workspaces: teams,
        currentWorkspace: teams.first,
      ),
    );
    expect(_row('team-39'), findsNothing);
    await tester.scrollUntilVisible(
      _row('team-39'),
      300,
      scrollable: find
          .descendant(
            of: find.byType(CustomScrollView),
            matching: find.byType(Scrollable),
          )
          .first,
    );
    await tester.pumpAndSettle();
    expect(
      tester.getRect(_row('team-39')).bottom,
      lessThanOrEqualTo(
        tester
            .getRect(find.byKey(const ValueKey('workspace-picker-create')))
            .top,
      ),
    );
    expect(tester.takeException(), isNull);
  });
}
