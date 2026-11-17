import 'dart:async';

import 'package:bloc_test/bloc_test.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/features/apps/cubit/app_tab_cubit.dart';
import 'package:mobile/features/assistant/cubit/assistant_chrome_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/shell/cubit/shell_mini_nav_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_cubit.dart';
import 'package:mobile/features/shell/cubit/shell_profile_state.dart';
import 'package:mobile/features/shell/cubit/shell_title_override_cubit.dart';
import 'package:mobile/features/shell/view/floating_shell_dock.dart';
import 'package:mobile/features/shell/view/shell_page.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../helpers/helpers.dart';

class _MockAuthCubit extends MockCubit<AuthState> implements AuthCubit {}

class _MockWorkspaceCubit extends MockCubit<WorkspaceState>
    implements WorkspaceCubit {}

class _MockShellProfileCubit extends MockCubit<ShellProfileState>
    implements ShellProfileCubit {}

/// A tall list keyed by [id], so each page's scrollable can be found.
Widget _list(String id) => ListView.builder(
  key: ValueKey('list-$id'),
  itemCount: 80,
  itemBuilder: (context, index) =>
      SizedBox(height: 60, child: Text('$id $index')),
);

ScrollPosition _position(WidgetTester tester, String id) => tester
    .state<ScrollableState>(
      find.descendant(
        of: find.byKey(ValueKey('list-$id')),
        matching: find.byType(Scrollable),
      ),
    )
    .position;

/// Whether the top bar draws its scrolled-under separator.
bool _separatorShown(WidgetTester tester) {
  final surface = tester.widget<AnimatedContainer>(
    find.byKey(const ValueKey('floating-shell-header-surface')),
  );
  final border = (surface.foregroundDecoration! as BoxDecoration).border!;
  return (border as Border).bottom.color.a > 0;
}

Future<void> _settle(WidgetTester tester) async {
  for (var i = 0; i < 10; i++) {
    await tester.pump(const Duration(milliseconds: 60));
  }
}

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues(<String, Object>{});
  });

  void phone(WidgetTester tester) {
    tester.view
      ..devicePixelRatio = 1
      ..physicalSize = const Size(390, 844);
    addTearDown(tester.view.reset);
  }

  testWidgets('a route pushed over a scrolled page opens at the top '
      'without the separator', (tester) async {
    phone(tester);
    final navigator = GlobalKey<NavigatorState>();
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: FloatingShellDock(
            location: '/mail',
            bottomInset: 68,
            header: const SizedBox(height: 46, child: Text('Header')),
            navigation: const SizedBox(width: 160, height: 60),
            child: Navigator(
              key: navigator,
              onGenerateRoute: (_) =>
                  MaterialPageRoute<void>(builder: (_) => _list('inbox')),
            ),
          ),
        ),
      ),
    );
    await _settle(tester);
    expect(_separatorShown(tester), isFalse);

    _position(tester, 'inbox').jumpTo(1200);
    await tester.pump();
    expect(_separatorShown(tester), isTrue);

    unawaited(
      navigator.currentState!.push(
        MaterialPageRoute<void>(builder: (_) => _list('reader')),
      ),
    );
    await tester.pumpAndSettle();
    expect(_position(tester, 'reader').pixels, 0);
    expect(_separatorShown(tester), isFalse);

    _position(tester, 'reader').jumpTo(300);
    await tester.pump();
    expect(_separatorShown(tester), isTrue);
    _position(tester, 'reader').jumpTo(0);
    await tester.pump();
    expect(_separatorShown(tester), isFalse);
  });

  group('shell routes', () {
    late AppTabCubit appTabCubit;
    late _MockAuthCubit authCubit;
    late _MockWorkspaceCubit workspaceCubit;
    late _MockShellProfileCubit profileCubit;

    setUp(() {
      appTabCubit = AppTabCubit(settingsRepository: SettingsRepository());
      authCubit = _MockAuthCubit();
      workspaceCubit = _MockWorkspaceCubit();
      profileCubit = _MockShellProfileCubit();
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
    });

    Future<GoRouter> pumpShell(WidgetTester tester, String location) async {
      final router = GoRouter(
        initialLocation: location,
        routes: [
          ShellRoute(
            builder: (context, state, child) => BlocProvider(
              create: (_) => AssistantChromeCubit(),
              child: ShellPage(
                matchedLocation: state.uri.path,
                enableDebugLogs: false,
                homePageBuilder: (_) => _list('home'),
                child: child,
              ),
            ),
            routes: [
              GoRoute(
                path: Routes.home,
                builder: (context, state) => const SizedBox.shrink(),
              ),
              GoRoute(
                path: Routes.settings,
                builder: (context, state) => _list('settings'),
              ),
              GoRoute(
                path: Routes.walletDetail,
                builder: (context, state) => _list('wallet'),
              ),
            ],
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
            BlocProvider(create: (_) => ShellTitleOverrideCubit()),
          ],
          child: app,
        ),
      );
      await _settle(tester);
      return router;
    }

    testWidgets('a location sharing the outgoing page template opens at the '
        'top without the separator', (tester) async {
      phone(tester);
      final router = await pumpShell(tester, Routes.walletDetailPath('a'));
      _position(tester, 'wallet').jumpTo(1500);
      await tester.pump();
      expect(_separatorShown(tester), isTrue);

      router.go(Routes.walletDetailPath('b'));
      await _settle(tester);
      expect(_position(tester, 'wallet').pixels, 0);
      expect(_separatorShown(tester), isFalse);
      expect(tester.takeException(), isNull);
    });

    testWidgets('a root tab keeps its scroll position and separator across '
        'pushed routes', (tester) async {
      phone(tester);
      final router = await pumpShell(tester, Routes.home);
      _position(tester, 'home').jumpTo(900);
      await tester.pump();
      expect(_separatorShown(tester), isTrue);

      router.go(Routes.settings);
      await _settle(tester);
      expect(_position(tester, 'settings').pixels, 0);
      expect(_separatorShown(tester), isFalse);

      router.go(Routes.home);
      await _settle(tester);
      expect(_position(tester, 'home').pixels, 900);
      expect(_separatorShown(tester), isTrue);
      expect(tester.takeException(), isNull);
    });
  });
}
