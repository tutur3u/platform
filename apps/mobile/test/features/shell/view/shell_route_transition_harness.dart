import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/layout/page_insets.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/persistent_shell_dock.dart';
import 'package:mobile/features/shell/view/shell_dock_action_button.dart';
import 'package:mobile/features/shell/view/shell_dock_action_group_bar.dart';
import 'package:mobile/features/shell/view/shell_dock_surface.dart';
import 'package:mobile/features/shell/view/shell_route_fade.dart';
import 'package:mobile/features/shell/view/shell_route_transition.dart';
import 'package:mobile/l10n/l10n.dart';

const inboxLocation = '/inbox';
const messageLocation = '/inbox/message';
const settingsLocation = '/settings';
const aboutLocation = '/settings/about';
const replacedLocation = '/about';

const dockMaterial = ValueKey<String>('persistent-shell-dock-material');
const dockBack = ValueKey<String>('route-harness-back');
const primaryTransition = ValueKey<String>('floating-dock-primary-transition');

const titles = <String, String>{
  inboxLocation: 'Inbox',
  messageLocation: 'Build 2.4.0 is ready to test',
  settingsLocation: 'Settings',
  aboutLocation: 'About',
  replacedLocation: 'About this app',
};

String bodyLabel(String location) => 'body $location';

/// Counts builds of the dock contents, which a frame must not rebuild.
final dockContentBuilds = <String, int>{};

class _CountedNavigation extends StatelessWidget {
  const _CountedNavigation({required this.location, required this.labels});
  final String location;
  final List<String> labels;

  @override
  Widget build(BuildContext context) {
    dockContentBuilds.update(location, (n) => n + 1, ifAbsent: () => 1);
    // The pill's content height, shared with the action group's pill.
    return SizedBox(
      height: ShellDockMetrics.height - ShellDockSurface.edge * 2,
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: [
          for (final label in labels)
            Text(label, style: const TextStyle(fontSize: 10)),
        ],
      ),
    );
  }
}

ShellDockActionGroup readerGroup() {
  ShellDockGroupAction action(String id, IconData icon) =>
      ShellDockGroupAction(id: id, icon: icon, label: id, onPressed: () {});
  return ShellDockActionGroup(
    actions: [
      action('Reply', Icons.reply),
      action('Reply all', Icons.reply_all),
      action('Forward', Icons.forward),
    ],
    primary: action('Archive', Icons.archive_outlined),
  );
}

Widget _dockContent(String location) => switch (location) {
  messageLocation => ShellDockActionGroupBar(group: readerGroup()),
  inboxLocation => _CountedNavigation(
    location: location,
    labels: const ['Inbox', 'Mailbox', 'Labels'],
  ),
  _ => _CountedNavigation(location: location, labels: const ['General']),
};

Widget _primary(String location) {
  final (id, icon) = switch (location) {
    messageLocation => ('Archive', Icons.archive_outlined),
    inboxLocation => ('Compose', Icons.edit_outlined),
    _ => ('Search', Icons.search),
  };
  return ShellDockActionButton(
    key: ValueKey(('dock-primary', id)),
    action: ShellActionSpec(id: id, icon: icon, tooltip: id, onPressed: () {}),
  );
}

/// A shell reduced to its route chrome: a title above the nested navigator
/// and the persistent dock below it, both on the route timeline.
class RouteHarnessShell extends StatefulWidget {
  const RouteHarnessShell({
    required this.location,
    required this.child,
    required this.arrivedBack,
    super.key,
  });

  final String location;
  final Widget child;
  final ValueNotifier<bool> arrivedBack;

  @override
  State<RouteHarnessShell> createState() => RouteHarnessShellState();
}

class RouteHarnessShellState extends State<RouteHarnessShell> {
  final controller = ShellRouteTransitionController();
  String? _previous;
  bool _back = false;

  @override
  void didUpdateWidget(RouteHarnessShell oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.location != widget.location) {
      _previous = oldWidget.location;
      _back = widget.arrivedBack.value;
      widget.arrivedBack.value = false;
    }
  }

  @override
  void dispose() {
    controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => ShellRouteTransitionScope(
    controller: controller,
    location: widget.location,
    previousLocation: _previous,
    arrivedBack: _back,
    child: Material(
      child: Column(
        children: [
          SizedBox(
            height: 56,
            child: ShellRouteFade(
              kind: ShellRouteFadeKind.title,
              alignment: AlignmentDirectional.centerStart,
              child: Text(
                titles[widget.location]!,
                key: ValueKey(('title', widget.location)),
              ),
            ),
          ),
          Expanded(child: widget.child),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            child: PersistentShellDock(
              fixedZones: true,
              leading: const SizedBox(key: dockBack, width: 52, height: 52),
              content: _dockContent(widget.location),
              primary: _primary(widget.location),
            ),
          ),
        ],
      ),
    ),
  );
}

class _Body extends StatelessWidget {
  const _Body(this.location);
  final String location;

  @override
  Widget build(BuildContext context) => ColoredBox(
    color: Theme.of(context).colorScheme.surface,
    child: Align(
      alignment: Alignment.topLeft,
      child: Text(bodyLabel(location), key: ValueKey(('body', location))),
    ),
  );
}

GoRouter routeHarnessRouter(ValueNotifier<bool> arrivedBack) => GoRouter(
  initialLocation: inboxLocation,
  routes: [
    ShellRoute(
      builder: (context, state, child) => RouteHarnessShell(
        location: state.uri.path,
        arrivedBack: arrivedBack,
        child: child,
      ),
      routes: shellTransitionRoutes([
        GoRoute(
          path: inboxLocation,
          builder: (_, _) => const _Body(inboxLocation),
          routes: [
            GoRoute(
              path: 'message',
              builder: (_, _) => const _Body(messageLocation),
            ),
          ],
        ),
        GoRoute(
          path: settingsLocation,
          builder: (_, _) => const _Body(settingsLocation),
          routes: [
            GoRoute(
              path: 'about',
              builder: (_, _) => const _Body(aboutLocation),
            ),
          ],
        ),
        GoRoute(
          path: replacedLocation,
          builder: (_, _) => const _Body(replacedLocation),
        ),
      ]),
    ),
  ],
);

Future<GoRouter> pumpRouteHarness(
  WidgetTester tester, {
  bool reduceMotion = false,
  TargetPlatform platform = TargetPlatform.android,
  ValueNotifier<bool>? arrivedBack,
}) async {
  tester.view
    ..physicalSize = const Size(390, 844)
    ..devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  final back = arrivedBack ?? ValueNotifier(false);
  if (arrivedBack == null) addTearDown(back.dispose);
  final router = routeHarnessRouter(back);
  addTearDown(router.dispose);
  dockContentBuilds.clear();
  await tester.pumpWidget(
    MaterialApp.router(
      theme: ThemeData(platform: platform),
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      routerConfig: router,
      builder: (context, child) => MediaQuery(
        data: MediaQuery.of(context).copyWith(disableAnimations: reduceMotion),
        child: child!,
      ),
    ),
  );
  await tester.pumpAndSettle();
  return router;
}

RouteHarnessShellState harnessShell(WidgetTester tester) =>
    tester.state<RouteHarnessShellState>(find.byType(RouteHarnessShell));

/// Opacity of the route fade layer holding [finder]: the nearest fade that
/// wraps a route layer, or for the circle's icons, the nearest fade.
double layerOpacity(WidgetTester tester, Finder finder) {
  final fades = tester
      .widgetList<FadeTransition>(
        find.ancestor(of: finder, matching: find.byType(FadeTransition)),
      )
      .toList();
  final layer = fades.where(
    (fade) => fade.child.runtimeType.toString() == '_RouteShift',
  );
  return (layer.isEmpty ? fades.first : layer.first).opacity.value;
}

/// Opacity of a route fade on the circle's icon (not the icon's own
/// switcher fade, which is keyed).
double iconOpacity(WidgetTester tester, Finder finder) => tester
    .widgetList<FadeTransition>(
      find.ancestor(of: finder, matching: find.byType(FadeTransition)),
    )
    .firstWhere(
      (fade) =>
          fade.key == null &&
          (fade.child is AnimatedSwitcher || fade.child is Icon),
    )
    .opacity
    .value;

Finder titleOf(String location) => find.byKey(ValueKey(('title', location)));

/// The rects that must never move: dock material, Back zone and circle.
List<Rect> dockGeometry(WidgetTester tester) => [
  tester.getRect(find.byKey(dockMaterial)),
  tester.getRect(find.byKey(dockBack)),
  tester.getRect(
    find.descendant(
      of: find.byKey(primaryTransition),
      matching: find.byType(FilledButton),
    ),
  ),
];
