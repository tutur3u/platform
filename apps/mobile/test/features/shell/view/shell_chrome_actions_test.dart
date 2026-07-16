import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';

import '../../../helpers/helpers.dart';

Future<void> _pumpFrames(WidgetTester tester, {int frames = 6}) async {
  for (var i = 0; i < frames; i++) {
    await tester.pump(const Duration(milliseconds: 60));
  }
}

class _ShellChromeActionsHarness extends StatefulWidget {
  const _ShellChromeActionsHarness();

  @override
  State<_ShellChromeActionsHarness> createState() =>
      _ShellChromeActionsHarnessState();
}

class _ShellChromeActionsHarnessState
    extends State<_ShellChromeActionsHarness> {
  String _matchedLocation = '/requests';
  String _workspaceId = 'ws-a';
  var _enabled = false;
  var _showSecondAction = false;
  var _tapCount = 0;
  String _lastWorkspaceAction = 'none';

  @override
  Widget build(BuildContext context) {
    final workspaceId = _workspaceId;

    return Column(
      children: [
        ShellInjectedActionsHost(matchedLocation: _matchedLocation),
        ShellChromeActions(
          ownerId: 'requests',
          locations: const {'/requests'},
          actions: [
            ShellActionSpec(
              id: 'filter',
              icon: Icons.filter_alt_outlined,
              tooltip: 'Filter requests',
              enabled: _enabled,
              onPressed: () => setState(() {
                _tapCount++;
                _lastWorkspaceAction = workspaceId;
              }),
            ),
            if (_showSecondAction)
              ShellActionSpec(
                id: 'search',
                icon: Icons.search_rounded,
                tooltip: 'Search requests',
                enabled: _enabled,
              ),
          ],
        ),
        ShellChromeActions(
          ownerId: 'stats',
          locations: const {'/stats'},
          actions: [
            ShellActionSpec(
              id: 'filter',
              icon: Icons.filter_alt_outlined,
              tooltip: 'Filter stats',
              enabled: _enabled,
              onPressed: () => setState(() {
                _tapCount++;
                _lastWorkspaceAction = workspaceId;
              }),
            ),
          ],
        ),
        TextButton(
          onPressed: () => setState(() => _enabled = true),
          child: const Text('enable'),
        ),
        TextButton(
          onPressed: () => setState(() => _matchedLocation = '/other'),
          child: const Text('switch-route'),
        ),
        TextButton(
          onPressed: () => setState(() => _matchedLocation = '/stats'),
          child: const Text('switch-shared-route'),
        ),
        TextButton(
          onPressed: () => setState(() => _workspaceId = 'ws-b'),
          child: const Text('switch-workspace'),
        ),
        TextButton(
          onPressed: () => setState(() => _showSecondAction = true),
          child: const Text('show-second-action'),
        ),
        Text('tap-count:$_tapCount'),
        Text('last-workspace:$_lastWorkspaceAction'),
      ],
    );
  }
}

void main() {
  group('ShellChromeActions', () {
    testWidgets('renders route actions immediately and enables in place', (
      tester,
    ) async {
      await tester.pumpApp(
        BlocProvider(
          create: (_) => ShellChromeActionsCubit(),
          child: const Material(child: _ShellChromeActionsHarness()),
        ),
      );
      await tester.pump();

      expect(find.byIcon(Icons.filter_alt_outlined), findsOneWidget);
      expect(find.text('tap-count:0'), findsOneWidget);

      await tester.tap(
        find.byIcon(Icons.filter_alt_outlined),
        warnIfMissed: false,
      );
      await tester.pump();
      expect(find.text('tap-count:0'), findsOneWidget);

      await tester.tap(find.text('enable'));
      await _pumpFrames(tester);

      await tester.tap(find.byIcon(Icons.filter_alt_outlined));
      await tester.pump();
      expect(find.text('tap-count:1'), findsOneWidget);
    });

    testWidgets('updates callbacks when only captured workspace changes', (
      tester,
    ) async {
      await tester.pumpApp(
        BlocProvider(
          create: (_) => ShellChromeActionsCubit(),
          child: const Material(child: _ShellChromeActionsHarness()),
        ),
      );
      await tester.pump();

      await tester.tap(find.text('enable'));
      await _pumpFrames(tester);

      await tester.tap(find.byIcon(Icons.filter_alt_outlined));
      await tester.pump();
      expect(find.text('last-workspace:ws-a'), findsOneWidget);

      await tester.tap(find.text('switch-workspace'));
      await _pumpFrames(tester);

      await tester.tap(find.byIcon(Icons.filter_alt_outlined));
      await tester.pump();
      expect(find.text('last-workspace:ws-b'), findsOneWidget);
    });

    testWidgets('clears actions when route no longer matches', (tester) async {
      await tester.pumpApp(
        BlocProvider(
          create: (_) => ShellChromeActionsCubit(),
          child: const Material(child: _ShellChromeActionsHarness()),
        ),
      );
      await tester.pump();

      expect(find.byIcon(Icons.filter_alt_outlined), findsOneWidget);

      await tester.tap(find.text('switch-route'));
      await _pumpFrames(tester);

      expect(find.byIcon(Icons.filter_alt_outlined), findsNothing);
    });

    testWidgets('collapses multiple top-bar actions into an overflow menu', (
      tester,
    ) async {
      await tester.pumpApp(
        BlocProvider(
          create: (_) => ShellChromeActionsCubit(),
          child: const Material(child: _ShellChromeActionsHarness()),
        ),
      );
      await tester.pump();

      await tester.tap(find.text('show-second-action'));
      await _pumpFrames(tester);

      expect(find.byKey(const ValueKey('shell-actions-overflow')), findsOne);
      expect(find.byIcon(Icons.filter_alt_outlined), findsNothing);
      expect(find.byIcon(Icons.search_rounded), findsNothing);

      await tester.tap(find.byKey(const ValueKey('shell-actions-overflow')));
      await tester.pumpAndSettle();

      expect(find.text('Filter requests'), findsOneWidget);
      expect(find.text('Search requests'), findsOneWidget);
    });

    testWidgets(
      'keeps shared action visible across routes with same action id',
      (tester) async {
        await tester.pumpApp(
          BlocProvider(
            create: (_) => ShellChromeActionsCubit(),
            child: const Material(child: _ShellChromeActionsHarness()),
          ),
        );
        await tester.pump();

        expect(find.byIcon(Icons.filter_alt_outlined), findsOneWidget);

        await tester.tap(find.text('switch-shared-route'));
        await tester.pump();

        expect(find.byIcon(Icons.filter_alt_outlined), findsOneWidget);
      },
    );
  });
}
