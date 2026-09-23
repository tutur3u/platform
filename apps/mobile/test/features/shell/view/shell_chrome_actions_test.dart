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
  test(
    'immersive registrations apply only while their route is active',
    () async {
      final cubit = ShellChromeActionsCubit()
        ..register(
          registrationId: 'meet-session',
          ownerId: 'meet',
          locations: {'/apps/meet'},
          actions: const [],
          immersive: true,
        );
      expect(cubit.state.immersiveForLocation('/apps/meet'), isTrue);
      expect(cubit.state.immersiveForLocation('/home'), isFalse);
      cubit.unregister('meet-session');
      expect(cubit.state.immersiveForLocation('/apps/meet'), isFalse);
      await cubit.close();
    },
  );

  testWidgets('Inbox and Archive form one selectable segmented control', (
    tester,
  ) async {
    final cubit = ShellChromeActionsCubit();
    addTearDown(cubit.close);
    var archived = false;
    await tester.pumpApp(
      BlocProvider.value(
        value: cubit,
        child: StatefulBuilder(
          builder: (context, update) => Material(
            child: Column(
              children: [
                ShellChromeActions(
                  ownerId: 'notifications',
                  locations: const {'/notifications'},
                  actions: [
                    ShellActionSpec(
                      id: 'inbox',
                      icon: Icons.inbox_outlined,
                      tooltip: 'Inbox',
                      segmentGroup: 'notification-tabs',
                      highlighted: !archived,
                      onPressed: () => update(() => archived = false),
                    ),
                    ShellActionSpec(
                      id: 'archive',
                      icon: Icons.archive_outlined,
                      tooltip: 'Archive',
                      segmentGroup: 'notification-tabs',
                      highlighted: archived,
                      onPressed: () => update(() => archived = true),
                    ),
                  ],
                ),
                const ShellInjectedActionsHost(
                  matchedLocation: '/notifications',
                ),
              ],
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('notification-tabs')), findsOneWidget);
    Semantics selected(String label) => tester
        .widgetList<Semantics>(find.byType(Semantics))
        .singleWhere((widget) => widget.properties.label == label);
    expect(selected('Inbox').properties.selected, isTrue);
    expect(selected('Archive').properties.selected, isFalse);
    await tester.tap(find.byIcon(Icons.archive_outlined));
    await tester.pumpAndSettle();
    expect(archived, isTrue);
    expect(selected('Archive').properties.selected, isTrue);
    expect(selected('Inbox').properties.selected, isFalse);
    await tester.tap(find.byIcon(Icons.inbox_outlined));
    await tester.pumpAndSettle();
    expect(archived, isFalse);
    expect(selected('Inbox').properties.selected, isTrue);
    expect(tester.takeException(), isNull);
  });

  for (final count in [1, 2, 3, 4, 5]) {
    testWidgets('$count header actions respect the three-button limit', (
      tester,
    ) async {
      var selected = -1;
      final cubit = ShellChromeActionsCubit();
      addTearDown(cubit.close);
      await tester.pumpApp(
        BlocProvider.value(
          value: cubit,
          child: Material(
            child: Column(
              children: [
                ShellChromeActions(
                  ownerId: 'limit',
                  locations: const {'/limit'},
                  actions: [
                    for (var i = 0; i < count; i++)
                      ShellActionSpec(
                        id: 'action-$i',
                        icon: Icons.star,
                        tooltip: 'Action $i',
                        onPressed: () => selected = i,
                      ),
                  ],
                ),
                const ShellInjectedActionsHost(matchedLocation: '/limit'),
              ],
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(
        find.byKey(const ValueKey('shell-actions-overflow')),
        count > 3 ? findsOneWidget : findsNothing,
      );
      for (var i = 0; i < (count > 3 ? 2 : count); i++) {
        expect(
          find.byKey(ValueKey('shell-action-button-action-$i')),
          findsOneWidget,
        );
      }
      if (count > 3) {
        await tester.tap(find.byKey(const ValueKey('shell-actions-overflow')));
        await tester.pumpAndSettle();
        expect(find.text('Action 2'), findsOneWidget);
        await tester.tap(find.text('Action 2'));
        await tester.pumpAndSettle();
        expect(selected, 2);
      }
    });
  }
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

    testWidgets('keeps the primary action visible on compact screens', (
      tester,
    ) async {
      tester.view
        ..devicePixelRatio = 1
        ..physicalSize = const Size(390, 844);
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });
      await tester.pumpApp(
        BlocProvider(
          create: (_) => ShellChromeActionsCubit(),
          child: const Material(child: _ShellChromeActionsHarness()),
        ),
      );
      await tester.pump();

      await tester.tap(find.text('show-second-action'));
      await _pumpFrames(tester);

      expect(
        find.byKey(const ValueKey('shell-actions-overflow')),
        findsNothing,
      );
      expect(find.byIcon(Icons.filter_alt_outlined), findsOneWidget);
      expect(find.byIcon(Icons.search_rounded), findsOneWidget);
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
