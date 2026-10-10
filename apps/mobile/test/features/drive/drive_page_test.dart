import 'dart:async';
import 'dart:ui' show CheckedState;
import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/widgets/shadcn_localizations_fallback.dart';
import 'package:mobile/core/widgets/shadcn_material_bridge.dart';
import 'package:mobile/data/models/drive/drive_models.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/drive_repository.dart';
import 'package:mobile/data/repositories/workspace_permissions_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/drive/view/drive_page.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_title_override_cubit.dart';
import 'package:mobile/features/shell/view/shell_mini_nav.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
import 'package:supabase_flutter/supabase_flutter.dart' show User;

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

class _Workspace extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

class _Permissions extends Fake implements WorkspacePermissionsRepository {
  _Permissions({this.canManageDrive = true});

  final bool canManageDrive;
  @override
  Future<WorkspacePermissions> getPermissions({
    required String wsId,
    String? userId,
  }) async => WorkspacePermissions(
    permissions: {if (canManageDrive) 'manage_drive'},
    isCreator: false,
  );
}

class _Drive extends Fake implements DriveRepository {
  final requests = <({String wsId, int offset, String search})>[];
  Future<DriveListResult> Function(String, int, String)? load;
  @override
  Future<DriveListResult> listDirectory(
    String wsId, {
    String? path,
    String? search,
    int limit = 50,
    int offset = 0,
    String sortBy = 'name',
    String sortOrder = 'asc',
  }) async {
    requests.add((wsId: wsId, offset: offset, search: search ?? ''));
    return await (load?.call(wsId, offset, search ?? '') ??
        Future.value(result(['Synthetic folder'], offset: offset)));
  }
}

DriveListResult result(List<String> names, {int offset = 0, int? total}) =>
    DriveListResult(
      entries: names
          .map((name) => DriveEntry(name: name, isFolder: true))
          .toList(),
      total: total ?? names.length,
      limit: 50,
      offset: offset,
    );
const initial = WorkspaceState(
  currentWorkspace: Workspace(id: 'synthetic-workspace'),
);
Future<void> pump(WidgetTester tester) async {
  for (var i = 0; i < 8; i++) {
    await tester.pump(const Duration(milliseconds: 50));
  }
}

void main() {
  late _Auth auth;
  late _Workspace workspace;
  late _Drive repository;
  late ShellChromeActionsCubit actions;
  late StreamController<WorkspaceState> changes;
  late StreamController<AuthState> actors;
  setUp(() {
    auth = _Auth();
    workspace = _Workspace();
    repository = _Drive();
    actions = ShellChromeActionsCubit();
    changes = StreamController<WorkspaceState>.broadcast();
    actors = StreamController<AuthState>.broadcast();
    whenListen(
      auth,
      actors.stream,
      initialState: const AuthState.unauthenticated(),
    );
    whenListen(workspace, changes.stream, initialState: initial);
  });
  tearDown(() async {
    await changes.close();
    await actors.close();
    await auth.close();
    await workspace.close();
    await actions.close();
  });
  Future<void> mount(
    WidgetTester tester, {
    bool canManageDrive = true,
    Size size = const Size(430, 844),
    Locale locale = const Locale('en'),
  }) async {
    tester.view
      ..devicePixelRatio = 1
      ..physicalSize = size;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });
    await tester.pumpWidget(
      MultiBlocProvider(
        providers: [
          BlocProvider<AuthCubit>.value(value: auth),
          BlocProvider<WorkspaceCubit>.value(value: workspace),
          BlocProvider.value(value: actions),
          BlocProvider(create: (_) => ShellTitleOverrideCubit()),
          BlocProvider(create: (_) => ShellMiniNavCubit()),
        ],
        child: shad.ShadcnApp(
          theme: const shad.ThemeData(colorScheme: shad.ColorSchemes.lightZinc),
          localizationsDelegates: const [
            ...AppLocalizations.localizationsDelegates,
            AppShadcnLocalizationsDelegate(),
          ],
          locale: locale,
          supportedLocales: AppLocalizations.supportedLocales,
          builder: ShadcnMaterialBridge.appBuilder,
          home: DrivePage(
            repository: repository,
            permissionsRepository: _Permissions(canManageDrive: canManageDrive),
          ),
        ),
      ),
    );
    await pump(tester);
  }

  ShellActionSpec search() => actions.state
      .resolveForLocation(Routes.drive)
      .firstWhere((action) => action.id == 'drive-search');
  for (final grid in [false, true]) {
    for (final canManageDrive in [false, true]) {
      testWidgets(
        '${grid ? 'grid' : 'list'} selection identifies each entry with '
        '${canManageDrive ? 'management' : 'read-only'} permission',
        (tester) async {
          final semantics = tester.ensureSemantics();
          try {
            repository.load = (ws, offset, query) async =>
                result(['First folder', 'Second folder']);
            await mount(
              tester,
              canManageDrive: canManageDrive,
              size: Size(grid ? 600 : 430, 844),
            );
            if (grid) {
              actions.state
                  .resolveForLocation(Routes.drive)
                  .firstWhere((action) => action.id == 'drive-view')
                  .onPressed!();
              await pump(tester);
            }
            final first = find.bySemanticsLabel('First folder');
            final second = find.bySemanticsLabel('Second folder');
            expect(first, findsOneWidget);
            expect(second, findsOneWidget);
            expect(find.byType(Checkbox), findsNWidgets(2));
            expect(
              tester
                  .getSemantics(first)
                  .getSemanticsData()
                  .flagsCollection
                  .isChecked,
              CheckedState.isFalse,
            );
            expect(
              tester
                  .getSemantics(second)
                  .getSemanticsData()
                  .flagsCollection
                  .isChecked,
              CheckedState.isFalse,
            );
            await tester.tap(second);
            await pump(tester);
            expect(
              tester
                  .getSemantics(first)
                  .getSemanticsData()
                  .flagsCollection
                  .isChecked,
              CheckedState.isFalse,
            );
            expect(
              tester
                  .getSemantics(second)
                  .getSemanticsData()
                  .flagsCollection
                  .isChecked,
              CheckedState.isTrue,
            );
            final deletes = actions.state
                .resolveForLocation(Routes.drive)
                .where((action) => action.id == 'drive-delete-selected');
            if (canManageDrive) {
              expect(deletes.single.tooltip, 'Delete selected (1)');
              expect(deletes.single.enabled, isTrue);
            } else {
              expect(deletes, isEmpty);
            }
            await tester.tap(second);
            await pump(tester);
            expect(
              tester
                  .getSemantics(second)
                  .getSemanticsData()
                  .flagsCollection
                  .isChecked,
              CheckedState.isFalse,
            );
            if (canManageDrive) {
              final clearSelection = actions.state
                  .resolveForLocation(Routes.drive)
                  .firstWhere((action) => action.id == 'drive-delete-selected');
              expect(clearSelection.tooltip, 'Delete selected (0)');
              expect(clearSelection.enabled, isFalse);
            }
            expect(tester.takeException(), isNull);
          } finally {
            semantics.dispose();
          }
        },
      );
    }
  }
  for (final width in [320.0, 360.0, 430.0, 600.0, 1280.0]) {
    for (final language in ['en', 'vi']) {
      for (final scale in [1.0, 2.0]) {
        for (final canManageDrive in [false, true]) {
          testWidgets('grid fits $width $language text scale $scale '
              'manage $canManageDrive', (tester) async {
            const longName =
                'A very long Vietnamese folder name – '
                'Tài liệu dự án và kế hoạch';
            const names = [longName, 'Second folder'];
            repository.load = (ws, offset, query) async => DriveListResult(
              entries: [
                DriveEntry(name: names[0], isFolder: true),
                DriveEntry(name: names[1], isFolder: false, size: 1536),
              ],
              total: 2,
              limit: 50,
              offset: 0,
            );
            await mount(
              tester,
              size: Size(width, 1200),
              canManageDrive: canManageDrive,
              locale: Locale(language),
            );
            actions.state
                .resolveForLocation(Routes.drive)
                .firstWhere((action) => action.id == 'drive-view')
                .onPressed!();
            await pump(tester);
            tester.platformDispatcher.textScaleFactorTestValue = scale;
            addTearDown(
              tester.platformDispatcher.clearTextScaleFactorTestValue,
            );
            await pump(tester);
            expect(tester.takeException(), isNull);
            final boxes = find.byType(Checkbox);
            expect(boxes, findsNWidgets(2));
            final first = tester.getTopLeft(boxes.first);
            final second = tester.getTopLeft(boxes.last);
            expect(second.dy >= first.dy, isTrue);
            if (width == 1280) {
              expect(second.dy, first.dy);
              expect(second.dx, greaterThan(first.dx));
            }
            await tester.ensureVisible(boxes.first);
            await tester.tap(boxes.first);
            await pump(tester);
            expect(tester.widget<Checkbox>(boxes.first).value, isTrue);
            expect(tester.widget<Checkbox>(boxes.last).value, isFalse);
            final l10n = AppLocalizations.of(tester.element(boxes.first));
            expect(find.text(l10n.driveDeleteSelected(1)), findsOneWidget);
            expect(find.text('1.5 KB'), findsOneWidget);
            expect(find.text(l10n.driveFolderLabel), findsOneWidget);
            final label = tester.getRect(
              find.text(l10n.driveDeleteSelected(1)),
            );
            expect(label.left, greaterThanOrEqualTo(0));
            expect(label.right, lessThanOrEqualTo(width));
            expect(tester.takeException(), isNull);
            final menu = find.byType(PopupMenuButton<String>).first;
            await tester.ensureVisible(menu);
            final card = tester.getRect(
              find
                  .ancestor(of: menu, matching: find.byType(FinancePanel))
                  .first,
            );
            for (final control in [boxes.first, menu]) {
              final rect = tester.getRect(control);
              expect(rect.left, greaterThanOrEqualTo(card.left));
              expect(rect.right, lessThanOrEqualTo(card.right));
              expect(rect.top, greaterThanOrEqualTo(card.top));
              expect(rect.bottom, lessThanOrEqualTo(card.bottom));
            }
            await tester.tap(menu);
            await pump(tester);
            expect(
              find.text(l10n.commonRename),
              canManageDrive ? findsOneWidget : findsNothing,
            );
            expect(
              find.text(l10n.commonDelete),
              canManageDrive ? findsOneWidget : findsNothing,
            );
            expect(tester.takeException(), isNull);
          });
        }
      }
    }
  }
  testWidgets('search is registered with the shared dock and closes cleanly', (
    tester,
  ) async {
    await mount(tester);
    expect(find.byType(TextField), findsNothing);
    search().onPressed!();
    await pump(tester);
    expect(search().searchController, isNotNull);
    search().searchController!.text = 'folder';
    search().onSearchChanged!('folder');
    await pump(tester);
    expect(repository.requests.last.search, 'folder');
    search().onCloseSearch!();
    await pump(tester);
    expect(search().searchController, isNull);
    expect(repository.requests.last.search, '');
    expect(tester.takeException(), isNull);
  });
  testWidgets(
    'underfilled viewport loads the next page without an explicit tap',
    (tester) async {
      repository.load = (ws, offset, query) async => result(
        [if (offset == 0) 'First folder' else 'Next folder'],
        offset: offset,
        total: 180,
      );
      await mount(tester);
      expect(repository.requests.map((item) => item.offset), [0, 100]);
      expect(find.text('Next folder'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets('late prior workspace response cannot restore its entries', (
    tester,
  ) async {
    final prior = Completer<DriveListResult>();
    repository.load = (ws, offset, query) => ws == 'synthetic-workspace'
        ? prior.future
        : Future.value(result(['Current workspace folder']));
    await mount(tester);
    changes.add(
      const WorkspaceState(currentWorkspace: Workspace(id: 'new-workspace')),
    );
    await pump(tester);
    prior.complete(result(['Prior private folder']));
    await pump(tester);
    expect(find.text('Current workspace folder'), findsOneWidget);
    expect(find.text('Prior private folder'), findsNothing);
    expect(tester.takeException(), isNull);
  });
  testWidgets('near-end scrolling pages and deduplicates directory entries', (
    tester,
  ) async {
    repository.load = (ws, offset, query) async => result(
      offset == 0
          ? List.generate(100, (i) => 'Folder $i')
          : ['Folder 99', 'Final folder'],
      offset: offset,
      total: 102,
    );
    await mount(tester);
    expect(repository.requests.length, 1);
    final scrollable = tester.state<ScrollableState>(
      find.byType(Scrollable).first,
    );
    scrollable.position.jumpTo(scrollable.position.maxScrollExtent);
    await pump(tester);
    expect(repository.requests.map((item) => item.offset), [0, 100]);
    scrollable.position.jumpTo(scrollable.position.maxScrollExtent);
    await pump(tester);
    expect(find.text('Final folder'), findsOneWidget);
    expect(find.text('Folder 99'), findsOneWidget);
  });
  testWidgets('an actor change discards the prior in-flight directory', (
    tester,
  ) async {
    final prior = Completer<DriveListResult>();
    var calls = 0;
    repository.load = (ws, offset, query) => calls++ == 0
        ? prior.future
        : Future.value(result(['New actor folder']));
    await mount(tester);
    actors.add(
      const AuthState.authenticated(
        User(
          id: 'synthetic-new-actor',
          appMetadata: {},
          userMetadata: {},
          aud: 'authenticated',
          createdAt: '2026-01-01T00:00:00Z',
        ),
      ),
    );
    await pump(tester);
    prior.complete(result(['Prior actor private folder']));
    await pump(tester);
    expect(find.text('New actor folder'), findsOneWidget);
    expect(find.text('Prior actor private folder'), findsNothing);
  });
  for (final challenge in [
    const ApiException(
      message: 'Synthetic verification required',
      statusCode: 403,
      code: 'MFA_REQUIRED',
    ),
    const ApiException(
      message: 'Synthetic verification required',
      statusCode: 403,
      isVerificationRequired: true,
    ),
  ]) {
    testWidgets(
      'refresh retains scoped files for ${challenge.code ?? 'typed'} MFA',
      (tester) async {
        await mount(tester);
        repository.load = (ws, offset, query) async => throw challenge;
        search().onPressed!();
        await pump(tester);
        search().onCloseSearch!();
        await pump(tester);
        expect(find.text('Synthetic folder'), findsOneWidget);
        expect(find.text('Synthetic verification required'), findsOneWidget);

        repository.load = (ws, offset, query) async => throw const ApiException(
          message: 'Synthetic denied after challenge',
          statusCode: 403,
        );
        search().onPressed!();
        await pump(tester);
        search().onCloseSearch!();
        await pump(tester);
        expect(find.text('Synthetic folder'), findsNothing);
        expect(find.text('Synthetic denied after challenge'), findsOneWidget);
      },
    );
  }
  testWidgets('refresh retains files but a definitive denial erases them', (
    tester,
  ) async {
    await mount(tester);
    repository.load = (ws, offset, query) async => throw const ApiException(
      message: 'Synthetic unavailable',
      statusCode: 503,
    );
    search().onPressed!();
    await pump(tester);
    search().onCloseSearch!();
    await pump(tester);
    expect(find.text('Synthetic folder'), findsOneWidget);
    repository.load = (ws, offset, query) async =>
        throw const ApiException(message: 'Synthetic denied', statusCode: 403);
    search().onPressed!();
    await pump(tester);
    search().onCloseSearch!();
    await pump(tester);
    expect(find.text('Synthetic folder'), findsNothing);
    expect(find.text('Synthetic denied'), findsOneWidget);
  });
}
