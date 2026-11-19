import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/app/view/auth_session_boundary.dart';

void main() {
  group('AuthSessionBoundary', () {
    setUp(_TestStatefulChildState.resetCounter);

    testWidgets('recreates child state when the auth identity changes', (
      tester,
    ) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: AuthSessionBoundary(
            identity: 'user-1',
            child: _TestStatefulChild(),
          ),
        ),
      );

      expect(find.text('init:1'), findsOneWidget);

      await tester.pumpWidget(
        const MaterialApp(
          home: AuthSessionBoundary(
            identity: 'user-1',
            child: _TestStatefulChild(),
          ),
        ),
      );

      expect(find.text('init:1'), findsOneWidget);

      await tester.pumpWidget(
        const MaterialApp(
          home: AuthSessionBoundary(
            identity: 'user-2',
            child: _TestStatefulChild(),
          ),
        ),
      );

      expect(find.text('init:1'), findsNothing);
      await tester.pump();
      expect(find.text('init:2'), findsOneWidget);
    });

    testWidgets(
      'discards route state held by GoRouter across account changes',
      (tester) async {
        final router = GoRouter(
          routes: [
            ShellRoute(
              builder: (_, _, child) => child,
              routes: [
                GoRoute(
                  path: '/',
                  builder: (_, _) => const _TestStatefulChild(),
                ),
              ],
            ),
          ],
        );
        addTearDown(router.dispose);
        Widget app(String actor) => MaterialApp.router(
          routerConfig: router,
          builder: (_, child) =>
              AuthSessionBoundary(identity: actor, child: child!),
        );

        await tester.pumpWidget(app('synthetic-user-a'));
        await tester.pumpAndSettle();
        expect(find.text('init:1'), findsOneWidget);

        await tester.pumpWidget(app('synthetic-user-b'));
        await tester.pumpAndSettle();
        expect(find.text('init:1'), findsNothing);
        expect(find.text('init:2'), findsOneWidget);
        expect(router.routeInformationProvider.value.uri.path, '/');
      },
    );
  });
}

class _TestStatefulChild extends StatefulWidget {
  const _TestStatefulChild();

  @override
  State<_TestStatefulChild> createState() => _TestStatefulChildState();
}

class _TestStatefulChildState extends State<_TestStatefulChild> {
  static int _initCount = 0;
  late final int _instanceInitCount;

  static void resetCounter() {
    _initCount = 0;
  }

  @override
  void initState() {
    super.initState();
    _instanceInitCount = ++_initCount;
  }

  @override
  Widget build(BuildContext context) {
    return Text('init:$_instanceInitCount', textDirection: TextDirection.ltr);
  }
}
