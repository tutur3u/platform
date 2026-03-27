import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';

import '../../../helpers/helpers.dart';

class _ShellChromeActionsHarness extends StatefulWidget {
  const _ShellChromeActionsHarness();

  @override
  State<_ShellChromeActionsHarness> createState() =>
      _ShellChromeActionsHarnessState();
}

class _ShellChromeActionsHarnessState
    extends State<_ShellChromeActionsHarness> {
  String _matchedLocation = '/requests';
  var _enabled = false;
  var _tapCount = 0;

  @override
  Widget build(BuildContext context) {
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
              onPressed: () => setState(() => _tapCount++),
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
        Text('tap-count:$_tapCount'),
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
          child: const Material(
            child: _ShellChromeActionsHarness(),
          ),
        ),
      );
      await tester.pump();

      expect(find.byIcon(Icons.filter_alt_outlined), findsOneWidget);
      expect(find.text('tap-count:0'), findsOneWidget);

      await tester.tap(find.byIcon(Icons.filter_alt_outlined));
      await tester.pump();
      expect(find.text('tap-count:0'), findsOneWidget);

      await tester.tap(find.text('enable'));
      await tester.pumpAndSettle();

      await tester.tap(find.byIcon(Icons.filter_alt_outlined));
      await tester.pump();
      expect(find.text('tap-count:1'), findsOneWidget);
    });

    testWidgets('clears actions when route no longer matches', (tester) async {
      await tester.pumpApp(
        BlocProvider(
          create: (_) => ShellChromeActionsCubit(),
          child: const Material(
            child: _ShellChromeActionsHarness(),
          ),
        ),
      );
      await tester.pump();

      expect(find.byIcon(Icons.filter_alt_outlined), findsOneWidget);

      await tester.tap(find.text('switch-route'));
      await tester.pumpAndSettle();

      expect(find.byIcon(Icons.filter_alt_outlined), findsNothing);
    });
  });
}
