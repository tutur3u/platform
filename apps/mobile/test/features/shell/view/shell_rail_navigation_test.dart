import 'dart:io';
import 'dart:ui' as ui;

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/layout/layout.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/theme/mobile_shad_theme.dart';
import 'package:mobile/core/widgets/shadcn_material_bridge.dart';
import 'package:mobile/data/models/workspace.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_chrome_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_state.dart';
import 'package:mobile/features/shell/cubit/shell_title_override_cubit.dart';
import 'package:mobile/features/shell/view/custom_navigation_bar.dart';
import 'package:mobile/features/shell/view/shell_mini_nav.dart';
import 'package:mobile/features/shell/view/shell_navigation_rail.dart';
import 'package:mobile/features/shell/view/shell_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;
import 'package:shared_preferences/shared_preferences.dart';

class _Auth extends MockCubit<AuthState> implements AuthCubit {}

class _Workspace extends MockCubit<WorkspaceState> implements WorkspaceCubit {}

class _Profile extends MockCubit<ShellProfileState>
    implements ShellProfileCubit {}

Widget _page(String label) => Center(child: Text(label));

const ValueKey<String> _renderKey = ValueKey('design-foundation-render');

Future<GoRouter> _pumpShell(
  WidgetTester tester,
  String location, {
  Widget Function(String route) page = _page,
}) async {
  SharedPreferences.setMockInitialValues({});
  final auth = _Auth();
  final workspace = _Workspace();
  final profile = _Profile();
  whenListen(
    auth,
    const Stream<AuthState>.empty(),
    initialState: const AuthState.unauthenticated(),
  );
  whenListen(
    workspace,
    const Stream<WorkspaceState>.empty(),
    initialState: const WorkspaceState(
      status: WorkspaceStatus.loaded,
      currentWorkspace: Workspace(id: 'ws', personal: true),
    ),
  );
  whenListen(
    profile,
    const Stream<ShellProfileState>.empty(),
    initialState: const ShellProfileState(),
  );
  final tabs = AppTabCubit(settingsRepository: SettingsRepository());
  addTearDown(auth.close);
  addTearDown(workspace.close);
  addTearDown(profile.close);
  addTearDown(tabs.close);
  final router = GoRouter(
    initialLocation: location,
    routes: [
      ShellRoute(
        builder: (context, state, child) => ShellPage(
          matchedLocation: state.uri.path,
          enableDebugLogs: false,
          assistantPageBuilder: (_) => _page('assistant'),
          child: child,
        ),
        routes: [
          for (final route in [
            Routes.home,
            Routes.apps,
            Routes.assistant,
            Routes.profileRoot,
            Routes.notifications,
            Routes.inventory,
            Routes.inventorySales,
          ])
            GoRoute(path: route, builder: (_, _) => page(route)),
        ],
      ),
    ],
  );
  addTearDown(router.dispose);
  await tester.pumpWidget(
    RepaintBoundary(
      key: _renderKey,
      child: MultiBlocProvider(
        providers: [
          BlocProvider<AuthCubit>.value(value: auth),
          BlocProvider<WorkspaceCubit>.value(value: workspace),
          BlocProvider<ShellProfileCubit>.value(value: profile),
          BlocProvider.value(value: tabs),
          BlocProvider(create: (_) => AssistantChromeCubit()),
          BlocProvider(create: (_) => ShellChromeActionsCubit()),
          BlocProvider(create: (_) => ShellMiniNavCubit()),
          BlocProvider(create: (_) => ShellTitleOverrideCubit()),
        ],
        child: shad.ShadcnApp.router(
          theme: MobileShadTheme.light,
          localizationsDelegates: const [
            ...AppLocalizations.localizationsDelegates,
            shad.ShadcnLocalizations.delegate,
          ],
          supportedLocales: AppLocalizations.supportedLocales,
          builder: ShadcnMaterialBridge.appBuilder,
          routerConfig: router,
        ),
      ),
    ),
  );
  await _settle(tester);
  return router;
}

Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 12; i++) {
    await tester.pump(const Duration(milliseconds: 50));
  }
}

void _useWindow(WidgetTester tester, Size size) {
  tester.view
    ..devicePixelRatio = 1
    ..physicalSize = size;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

Finder _railItem(String label) => find.descendant(
  of: find.byType(ShellNavigationRail),
  matching: find.bySemanticsLabel(label),
);

/// A representative standard page built only from the foundation primitives.
Widget _primitivePage(String route) => Builder(
  builder: (context) => AppPageListView(
    children: [
      Text(
        'Documents',
        key: const ValueKey('primitive-title'),
        style: Theme.of(
          context,
        ).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w700),
      ),
      const SizedBox(height: AppLayout.sectionGap),
      for (final (caption, rows) in [
        ('Recent', ['Roadmap', 'Meeting notes', 'Launch checklist']),
        ('Shared with me', ['Design review', 'Budget']),
      ])
        AppGroupedSection.spaced(
          caption: caption,
          children: [
            for (final row in rows)
              ListTile(
                minTileHeight: AppLayout.rowMinHeight,
                leading: const Icon(Icons.description_outlined),
                title: Text(row),
                subtitle: const Text('Edited today'),
                trailing: const Icon(Icons.chevron_right),
              ),
          ],
        ),
    ],
  ),
);

Future<void> _capture(WidgetTester tester, String name) async {
  final output = Platform.environment['DESIGN_RENDER_DIR'];
  if (output == null) return;
  await tester.runAsync(() async {
    final boundary = tester.renderObject<RenderRepaintBoundary>(
      find.byKey(_renderKey),
    );
    final image = await boundary.toImage();
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    await Directory(output).create(recursive: true);
    await File('$output/$name.png').writeAsBytes(bytes!.buffer.asUint8List());
    image.dispose();
  });
}

void main() {
  setUpAll(() async {
    for (final family in ['NotoSans', 'Roboto']) {
      await (FontLoader(
        family,
      )..addFont(rootBundle.load('assets/fonts/NotoSans.ttf'))).load();
    }
    await (FontLoader(
      'MaterialIcons',
    )..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'))).load();
  });
  setUp(() {
    // Real async work during captures reaches the Android back channel.
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
          const MethodChannel('mobile/shell_back'),
          (_) async => null,
        );
  });

  for (final (name, size, gutter) in [
    ('phone', const Size(390, 844), 16.0),
    ('tablet-portrait', const Size(768, 1024), 24.0 + 84),
    ('desktop', const Size(1280, 800), 32.0 + 239),
  ]) {
    testWidgets('page primitives use body-width gutters on $name', (
      tester,
    ) async {
      _useWindow(tester, size);
      await _pumpShell(tester, Routes.inventorySales, page: _primitivePage);
      final rail = find.byType(ShellNavigationRail);
      final railMode = shellNavigationModeFor(size) == ShellNavigationMode.rail;
      expect(rail, railMode ? findsOneWidget : findsNothing);
      final bodyStart = railMode ? shellNavigationRailExtent : 0.0;
      final bodyWidth = size.width - bodyStart;
      final expected = AppPageInsets.resolve(width: bodyWidth).left;
      final title = tester.getRect(
        find.byKey(const ValueKey('primitive-title')),
      );
      expect(title.left - bodyStart, closeTo(expected, 0.5));
      expect(expected, closeTo(gutter, 0.5));
      expect(tester.takeException(), isNull);
      await _capture(tester, 'design-foundation-$name');
    });
  }

  testWidgets('expanded mini apps keep Back in the rail', (tester) async {
    _useWindow(tester, const Size(1280, 800));
    final router = await _pumpShell(tester, Routes.apps);
    router.go(Routes.inventorySales);
    await _settle(tester);
    final l10n = AppLocalizations.of(tester.element(find.byType(ShellPage)));

    expect(find.byType(ShellNavigationRail), findsOneWidget);
    expect(find.byType(MorphingNavigationBar), findsNothing);
    expect(_railItem(l10n.navBack), findsOneWidget);
    expect(_railItem(l10n.inventoryProductsLabel), findsOneWidget);

    await tester.tap(_railItem(l10n.navBack));
    await _settle(tester);
    expect(router.routeInformationProvider.value.uri.path, Routes.apps);
    expect(_railItem(l10n.navHome), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('system Back still works when the rail replaces the dock', (
    tester,
  ) async {
    _useWindow(tester, const Size(1280, 800));
    final router = await _pumpShell(tester, Routes.apps);
    router.go(Routes.inventorySales);
    await _settle(tester);

    await tester.binding.handlePopRoute();
    await _settle(tester);
    expect(router.routeInformationProvider.value.uri.path, Routes.apps);
    expect(tester.takeException(), isNull);
  });

  testWidgets('deep links open directly into the rail layout', (tester) async {
    _useWindow(tester, const Size(1280, 800));
    final router = await _pumpShell(tester, Routes.inventorySales);
    final l10n = AppLocalizations.of(tester.element(find.byType(ShellPage)));

    expect(find.text(Routes.inventorySales), findsOneWidget);
    expect(_railItem(l10n.navBack), findsOneWidget);
    await tester.tap(_railItem(l10n.navBack));
    await _settle(tester);
    expect(
      router.routeInformationProvider.value.uri.path,
      isNot(Routes.inventorySales),
    );
    expect(tester.takeException(), isNull);
  });

  testWidgets('phones in landscape keep the floating dock', (tester) async {
    _useWindow(tester, const Size(844, 390));
    await _pumpShell(tester, Routes.apps);
    expect(find.byType(ShellNavigationRail), findsNothing);
    expect(find.byType(MorphingNavigationBar), findsOneWidget);
  });
}
