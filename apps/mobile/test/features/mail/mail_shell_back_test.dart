import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/core/theme/appearance/ambient_background.dart';
import 'package:mobile/core/theme/appearance/appearance_scope.dart';
import 'package:mobile/core/theme/appearance/appearance_settings.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_chrome_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/mail/data/mail_push_destination.dart';
import 'package:mobile/features/mail/view/mail_page.dart';
import 'package:mobile/features/mail/view/mail_reader.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_mini_nav_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_state.dart';
import 'package:mobile/features/shell/cubit/shell_title_override_cubit.dart';
import 'package:mobile/features/shell/view/shell_page.dart';
import 'package:mobile/features/shell/view/shell_route_transition.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';

import '../../helpers/helpers.dart';
import 'mail_preview_harness.dart';

class _MockAuthCubit extends MockCubit<AuthState> implements AuthCubit {}

class _MockWorkspaceCubit extends MockCubit<WorkspaceState>
    implements WorkspaceCubit {}

class _MockShellProfileCubit extends MockCubit<ShellProfileState>
    implements ShellProfileCubit {}

const double _offset = 300;
const _dockBack = ValueKey<String>('shell-dock-back');

/// Mail as production mounts it: the inbox in Mail's own navigator, with
/// the reader pushed over it at the Mail location.
class _Mail extends StatelessWidget {
  const _Mail(this.repository, {this.destination});
  final MailPreviewRepository repository;
  final MailPushDestination? destination;

  @override
  Widget build(BuildContext context) => Navigator(
    onGenerateRoute: (_) => MaterialPageRoute<void>(
      builder: (_) => MailWorkspace(
        workspaceId: 'ws',
        repository: repository,
        destination: destination,
      ),
    ),
  );
}

/// A mail notification for the synthetic mailbox's fourth thread.
const _pushed = MailPushDestination(
  userId: 'user',
  mailboxId: 'box',
  threadId: 'thread-3',
  notificationId: 'notification',
);

ScrollPosition _inbox(WidgetTester tester) => Scrollable.of(
  tester.element(find.text('Synthetic subject 0', skipOffstage: false)),
).position;

String _location(WidgetTester tester) => tester
    .widget<ShellRouteTransitionScope>(find.byType(ShellRouteTransitionScope))
    .location;

void main() {
  late AppTabCubit appTabCubit;
  late _MockAuthCubit authCubit;
  late _MockWorkspaceCubit workspaceCubit;
  late _MockShellProfileCubit profileCubit;
  late ShellTitleOverrideCubit titles;

  setUp(() {
    appTabCubit = AppTabCubit(settingsRepository: SettingsRepository());
    authCubit = _MockAuthCubit();
    workspaceCubit = _MockWorkspaceCubit();
    profileCubit = _MockShellProfileCubit();
    titles = ShellTitleOverrideCubit();
    whenListen(
      authCubit,
      const Stream<AuthState>.empty(),
      initialState: const AuthState.unauthenticated(),
    );
    whenListen(
      workspaceCubit,
      const Stream<WorkspaceState>.empty(),
      initialState: const WorkspaceState(),
    );
    whenListen(
      profileCubit,
      const Stream<ShellProfileState>.empty(),
      initialState: const ShellProfileState(),
    );
  });

  tearDown(() async {
    await appTabCubit.close();
    await authCubit.close();
    await workspaceCubit.close();
    await profileCubit.close();
    await titles.close();
  });

  /// Opens Mail from Home, scrolls the inbox to [_offset] and opens the
  /// first conversation that is fully on screen.
  ///
  /// With [destination], Mail opens from [start] the way a notification
  /// opens it: straight into that conversation's reader.
  Future<GoRouter> openReader(
    WidgetTester tester, {
    AppearanceSettings? appearance,
    String start = Routes.home,
    MailPushDestination? destination,
  }) async {
    setMailSurface(tester, const Size(390, 844));
    final repository = MailPreviewRepository();
    stubMailPreview(repository, threads: 40);
    final router = GoRouter(
      initialLocation: start,
      routes: [
        ShellRoute(
          // The shared app theme is created once per test isolate, so its
          // platform follows whichever test built it first; pin this test's.
          builder: (context, state, child) => Theme(
            data: Theme.of(context).copyWith(platform: defaultTargetPlatform),
            child: BlocProvider(
              create: (_) => AssistantChromeCubit(),
              child: ShellPage(
                matchedLocation: state.uri.path,
                routePattern: state.fullPath,
                enableDebugLogs: false,
                homePageBuilder: (_) => const SizedBox.shrink(),
                child: child,
              ),
            ),
          ),
          routes: shellTransitionRoutes([
            GoRoute(
              path: Routes.home,
              builder: (_, _) => const SizedBox.shrink(),
            ),
            GoRoute(
              path: Routes.notifications,
              builder: (_, _) => const SizedBox.shrink(),
            ),
            GoRoute(
              path: Routes.mail,
              builder: (_, _) => _Mail(repository, destination: destination),
            ),
          ]),
        ),
      ],
    );
    addTearDown(router.dispose);
    await tester.pumpAppRouter(
      router,
      wrap: (app) => MultiBlocProvider(
        providers: [
          BlocProvider.value(value: appTabCubit),
          BlocProvider<AuthCubit>.value(value: authCubit),
          BlocProvider<WorkspaceCubit>.value(value: workspaceCubit),
          BlocProvider<ShellProfileCubit>.value(value: profileCubit),
          BlocProvider(create: (_) => ShellMiniNavCubit()),
          BlocProvider.value(value: titles),
          BlocProvider(create: (_) => ShellChromeActionsCubit()),
        ],
        child: appearance == null
            ? app
            : AppearanceScope(
                settings: appearance,
                brightness: Brightness.light,
                child: app,
              ),
      ),
    );
    await settleMail(tester);
    if (start != Routes.mail) router.go(Routes.mail);
    await settleMail(tester);
    if (destination != null) return router;
    _inbox(tester).jumpTo(_offset);
    await settleMail(tester);
    final row = find
        .textContaining('Synthetic subject')
        .hitTestable()
        .evaluate()
        .map((element) => (element.widget as Text).data!)
        .first;
    await tester.tap(find.text(row));
    return router;
  }

  Future<void> expectInboxAt(WidgetTester tester) async {
    await settleMail(tester);
    expect(_location(tester), Routes.mail);
    expect(find.byType(MailReader), findsNothing);
    expect(_inbox(tester).pixels, _offset);
    // The reader's Back retired with it; the next Back leaves Mail.
    final actions = tester
        .element(find.byType(ShellPage))
        .read<ShellChromeActionsCubit>();
    expect(actions.state.backForLocation(Routes.mail), isNull);
    await tester.tap(find.byKey(_dockBack));
    await settleMail(tester);
    expect(_location(tester), Routes.home);
    expect(tester.takeException(), isNull);
    await drain(tester);
  }

  testWidgets('the reader opens over an opaque page with one title', (
    tester,
  ) async {
    await openReader(tester);
    // Mid-transition: the reader page is sliding over the inbox.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 120));
    final route = ModalRoute.of(tester.element(find.byType(MailReader)))!;
    expect(route.animation!.isAnimating, isTrue);
    final backdrop = find.descendant(
      of: find
          .ancestor(
            of: find.byType(MailReader),
            matching: find.byType(AppearanceRouteBackground),
          )
          .first,
      matching: find.byKey(const ValueKey('appearance-route-backdrop')),
    );
    expect(backdrop, findsOneWidget);
    expect(tester.widget<ColoredBox>(backdrop).color.a, 1);
    expect(tester.getSize(backdrop), tester.getSize(find.byType(MailReader)));
    // Only the reader names the Mail location; the inbox title retired.
    final override = titles.state.resolveForLocation(Routes.mail);
    expect(override, isNot('Inbox'));
    await settleMail(tester);
    expect(_location(tester), Routes.mail);
    await drain(tester);
  });

  testWidgets('the dock Back returns to the inbox at its scroll position', (
    tester,
  ) async {
    await openReader(tester);
    await settleMail(tester);
    expect(find.byType(MailReader), findsOneWidget);
    await tester.tap(find.byKey(_dockBack));
    await expectInboxAt(tester);
  });

  testWidgets('system Back returns to the inbox at its scroll position', (
    tester,
  ) async {
    await openReader(tester);
    await settleMail(tester);
    await tester.binding.handlePopRoute();
    await expectInboxAt(tester);
  });

  testWidgets('the edge swipe returns to the inbox at its scroll position', (
    tester,
  ) async {
    await openReader(tester);
    await settleMail(tester);
    final gesture = await tester.startGesture(const Offset(4, 400));
    await gesture.moveBy(const Offset(40, 0));
    await tester.pump();
    await gesture.moveBy(const Offset(260, 0));
    await tester.pump();
    await gesture.up();
    await expectInboxAt(tester);
  }, variant: TargetPlatformVariant.only(TargetPlatform.iOS));

  testWidgets('a second Back while the reader closes keeps the inbox', (
    tester,
  ) async {
    await openReader(tester);
    await settleMail(tester);
    await tester.tap(find.byKey(_dockBack));
    await tester.pump(const Duration(milliseconds: 16));
    await tester.tap(find.byKey(_dockBack), warnIfMissed: false);
    await tester.binding.handlePopRoute();
    await expectInboxAt(tester);
  });

  testWidgets('a Back while a swipe settles keeps the inbox', (tester) async {
    await openReader(tester);
    await settleMail(tester);
    final gesture = await tester.startGesture(const Offset(4, 400));
    await gesture.moveBy(const Offset(40, 0));
    await tester.pump();
    await gesture.moveBy(const Offset(260, 0));
    await tester.pump();
    await gesture.up();
    await tester.pump(const Duration(milliseconds: 16));
    await tester.binding.handlePopRoute();
    await expectInboxAt(tester);
  }, variant: TargetPlatformVariant.only(TargetPlatform.iOS));

  testWidgets('an ambient backdrop lines up with the screen and only while '
      'the reader moves', (tester) async {
    await openReader(
      tester,
      appearance: const AppearanceSettings(
        backgroundStyle: AppearanceBackgroundStyle.gradient,
      ),
    );
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 120));
    final routeBackdrop = find
        .ancestor(
          of: find.byType(MailReader),
          matching: find.byType(AppearanceRouteBackground),
        )
        .first;
    final ambient = find.descendant(
      of: routeBackdrop,
      matching: find.byType(AmbientBackground),
    );
    expect(ambient, findsOneWidget);
    // Screen-sized and screen-aligned, though the page starts below the
    // header: no seam against the app-wide layer.
    expect(tester.getSize(ambient), const Size(390, 844));
    expect(tester.getTopLeft(ambient), Offset.zero);
    expect(tester.getTopLeft(find.byType(MailReader)).dx, greaterThan(0));
    expect(tester.getTopLeft(find.byType(MailReader)).dy, greaterThan(0));
    // Nothing of the inbox paints through the moving reader.
    expect(
      tester.getSize(routeBackdrop),
      tester.getSize(find.byType(MailReader)),
    );
    await settleMail(tester);
    // At rest the app-wide layer shows behind the page; no second painter.
    expect(
      find.descendant(
        of: find
            .ancestor(
              of: find.byType(MailReader),
              matching: find.byType(AppearanceRouteBackground),
            )
            .first,
        matching: find.byType(AmbientBackground),
      ),
      findsNothing,
    );
    await drain(tester);
  });

  testWidgets('one Back from a Mail message opened from Notifications '
      'returns there', (tester) async {
    await openReader(tester, start: Routes.notifications, destination: _pushed);
    expect(find.byType(MailReader), findsOneWidget);
    await tester.tap(find.byKey(_dockBack));
    await settleMail(tester);
    expect(_location(tester), Routes.notifications);
    expect(tester.takeException(), isNull);
    await drain(tester);
  });

  testWidgets('a cold-start Mail notification closes to the inbox', (
    tester,
  ) async {
    await openReader(tester, start: Routes.mail, destination: _pushed);
    expect(find.byType(MailReader), findsOneWidget);
    await tester.tap(find.byKey(_dockBack));
    await settleMail(tester);
    expect(_location(tester), Routes.mail);
    expect(find.byType(MailReader), findsNothing);
    expect(
      find.text('Synthetic subject 0', skipOffstage: false),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
    await drain(tester);
  });
}
