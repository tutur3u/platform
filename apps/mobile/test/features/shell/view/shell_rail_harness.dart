import 'dart:io';
import 'dart:ui' as ui;

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/services.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
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

/// Shared ShellPage harness for the rail/dock layout tests.
class RailShell {
  RailShell(this.router, this.actions);

  final GoRouter router;
  final ShellChromeActionsCubit actions;

  String get path => router.routeInformationProvider.value.uri.path;
}

const ValueKey<String> railRenderKey = ValueKey('design-foundation-render');

/// The shell routes registered by [pumpRailShell].
const railShellRoutes = <String>[
  Routes.home,
  Routes.apps,
  Routes.assistant,
  Routes.profileRoot,
  Routes.notifications,
  Routes.inventory,
  Routes.inventorySales,
];

Widget railPlaceholderPage(String label) => Center(child: Text(label));

Future<RailShell> pumpRailShell(
  WidgetTester tester,
  String location, {
  Widget Function(String route) page = railPlaceholderPage,
  Widget Function(int replayToken)? assistantPage,
  TextDirection? textDirection,
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
  final actions = ShellChromeActionsCubit();
  addTearDown(auth.close);
  addTearDown(workspace.close);
  addTearDown(profile.close);
  addTearDown(tabs.close);
  addTearDown(actions.close);
  final router = GoRouter(
    initialLocation: location,
    routes: [
      ShellRoute(
        builder: (context, state, child) => ShellPage(
          matchedLocation: state.uri.path,
          enableDebugLogs: false,
          assistantPageBuilder:
              assistantPage ?? (_) => railPlaceholderPage('assistant'),
          child: child,
        ),
        routes: [
          for (final route in railShellRoutes)
            GoRoute(path: route, builder: (_, _) => page(route)),
        ],
      ),
    ],
  );
  addTearDown(router.dispose);
  await tester.pumpWidget(
    RepaintBoundary(
      key: railRenderKey,
      child: MultiBlocProvider(
        providers: [
          BlocProvider<AuthCubit>.value(value: auth),
          BlocProvider<WorkspaceCubit>.value(value: workspace),
          BlocProvider<ShellProfileCubit>.value(value: profile),
          BlocProvider.value(value: tabs),
          BlocProvider.value(value: actions),
          BlocProvider(create: (_) => AssistantChromeCubit()),
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
          builder: (context, child) {
            final app = ShadcnMaterialBridge.appBuilder(context, child);
            return textDirection == null
                ? app
                : Directionality(textDirection: textDirection, child: app);
          },
          routerConfig: router,
        ),
      ),
    ),
  );
  await settleShell(tester);
  return RailShell(router, actions);
}

Future<void> settleShell(WidgetTester tester) async {
  for (var i = 0; i < 12; i++) {
    await tester.pump(const Duration(milliseconds: 50));
  }
}

void useShellWindow(WidgetTester tester, Size size) {
  tester.view
    ..devicePixelRatio = 1
    ..physicalSize = size;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
}

/// Resizes the window, as rotation or a desktop resize would.
Future<void> resizeShellWindow(WidgetTester tester, Size size) async {
  tester.view.physicalSize = size;
  await settleShell(tester);
}

Finder railItem(String label) => find.descendant(
  of: find.byType(ShellNavigationRail),
  matching: find.bySemanticsLabel(label),
);

AppLocalizations shellL10n(WidgetTester tester) =>
    AppLocalizations.of(tester.element(find.byType(ShellPage)));

/// Fonts so `DESIGN_RENDER_DIR` captures render real glyphs.
Future<void> loadRailRenderFonts() async {
  for (final family in ['NotoSans', 'Roboto']) {
    await (FontLoader(
      family,
    )..addFont(rootBundle.load('assets/fonts/NotoSans.ttf'))).load();
  }
  await (FontLoader(
    'MaterialIcons',
  )..addFont(rootBundle.load('fonts/MaterialIcons-Regular.otf'))).load();
}

/// Real async work during captures reaches the Android back channel.
void mockShellBackChannel() {
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      .setMockMethodCallHandler(
        const MethodChannel('mobile/shell_back'),
        (_) async => null,
      );
}

Future<void> captureRailShell(WidgetTester tester, String name) async {
  final output = Platform.environment['DESIGN_RENDER_DIR'];
  if (output == null) return;
  await tester.runAsync(() async {
    final boundary = tester.renderObject<RenderRepaintBoundary>(
      find.byKey(railRenderKey),
    );
    final image = await boundary.toImage();
    final bytes = await image.toByteData(format: ui.ImageByteFormat.png);
    await Directory(output).create(recursive: true);
    await File('$output/$name.png').writeAsBytes(bytes!.buffer.asUint8List());
    image.dispose();
  });
}

/// Counts state creations so tests can prove a subtree was not remounted.
class MountProbe extends StatefulWidget {
  const MountProbe({required this.label, required this.mounts, super.key});

  final String label;
  final List<String> mounts;

  @override
  State<MountProbe> createState() => _MountProbeState();
}

class _MountProbeState extends State<MountProbe> {
  @override
  void initState() {
    super.initState();
    widget.mounts.add(widget.label);
  }

  @override
  Widget build(BuildContext context) =>
      Center(child: Text(widget.label, key: ValueKey('probe-${widget.label}')));
}
