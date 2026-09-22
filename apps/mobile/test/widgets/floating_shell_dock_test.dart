import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/floating_shell_dock.dart';

void main() {
  Future<void> mount(
    WidgetTester tester, {
    Size size = const Size(390, 844),
  }) async {
    tester.view.physicalSize = size;
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: FloatingShellDock(
            location: '/settings',
            bottomInset: 68,
            navigation: const Align(
              heightFactor: 1,
              child: SizedBox(
                key: Key('navigation'),
                width: 160,
                height: 60,
                child: Text('Navigation'),
              ),
            ),
            child: Builder(
              builder: (context) => ListView(
                padding: EdgeInsets.fromLTRB(
                  16,
                  16,
                  16,
                  16 + MediaQuery.paddingOf(context).bottom,
                ),
                children: List.generate(
                  30,
                  (i) => SizedBox(height: 70, child: Text('Row $i')),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  for (final size in [const Size(390, 844), const Size(1194, 834)]) {
    testWidgets('last explicit-padding row clears dock at $size', (
      tester,
    ) async {
      await mount(tester, size: size);
      await tester.drag(find.byType(ListView), const Offset(0, -3000));
      await tester.pumpAndSettle();
      await tester.pump(const Duration(seconds: 2));
      await tester.pumpAndSettle();
      expect(
        tester.getBottomLeft(find.text('Row 29')).dy,
        lessThan(tester.getTopLeft(find.byKey(const Key('navigation'))).dy),
      );
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('scroll viewport continues behind and below floating dock', (
    tester,
  ) async {
    await mount(tester);
    final viewport = tester.getRect(find.byType(ListView));
    final dock = tester.getRect(find.byKey(const Key('navigation')));
    expect(viewport.bottom, 844);
    expect(viewport.bottom, greaterThan(dock.top));
    // Content remains hit-testable beside the island, down to the screen edge.
    final position = tester
        .state<ScrollableState>(find.byType(Scrollable))
        .position;
    await tester.dragFrom(const Offset(20, 835), const Offset(0, -100));
    await tester.pumpAndSettle();
    expect(position.pixels, greaterThan(0));
    await tester.pump(const Duration(seconds: 2));
    await tester.pumpAndSettle();
  });

  testWidgets('down scroll hides and idle restores without moving list', (
    tester,
  ) async {
    await mount(tester);
    final before = tester.getRect(find.byType(ListView));
    await tester.drag(find.byType(ListView), const Offset(0, -160));
    await tester.pump(const Duration(milliseconds: 250));
    expect(
      tester.widget<AnimatedOpacity>(find.byType(AnimatedOpacity)).opacity,
      0,
    );
    expect(tester.getRect(find.byType(ListView)), before);
    await tester.pump(const Duration(seconds: 2));
    await tester.pumpAndSettle();
    expect(
      tester.widget<AnimatedOpacity>(find.byType(AnimatedOpacity)).opacity,
      1,
    );
  });

  testWidgets('route handoff previews never retain old action callbacks', (
    tester,
  ) async {
    final cubit = ShellChromeActionsCubit();
    addTearDown(cubit.close);
    var staleCalls = 0;
    var currentCalls = 0;
    cubit
      ..register(
        registrationId: 'old',
        ownerId: 'mail',
        locations: {'/mail'},
        actions: [
          ShellActionSpec(
            id: 'compose',
            icon: Icons.edit,
            tooltip: 'Compose',
            inDock: true,
            onPressed: () => staleCalls++,
          ),
        ],
      )
      ..unregister('old');
    expect(cubit.dockPreviewForLocation('/mail').single.onPressed, isNull);
    await tester.pumpWidget(
      MaterialApp(
        home: BlocProvider.value(
          value: cubit,
          child: const Scaffold(
            body: FloatingShellDock(
              location: '/mail',
              bottomInset: 68,
              navigation: SizedBox(width: 160, height: 60),
              child: SizedBox.expand(),
            ),
          ),
        ),
      ),
    );
    expect(find.byIcon(Icons.edit), findsOneWidget);
    await tester.tap(find.byType(FilledButton));
    expect(staleCalls, 0);
    cubit.register(
      registrationId: 'current',
      ownerId: 'mail',
      locations: {'/mail'},
      actions: [
        ShellActionSpec(
          id: 'compose',
          icon: Icons.edit,
          tooltip: 'Compose',
          inDock: true,
          onPressed: () => currentCalls++,
        ),
      ],
    );
    await tester.pump();
    await tester.tap(find.byType(FilledButton));
    expect(currentCalls, 1);
    expect(staleCalls, 0);
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });

  testWidgets('primary action is clickable beside the navigation', (
    tester,
  ) async {
    var calls = 0;
    final cubit = ShellChromeActionsCubit();
    addTearDown(cubit.close);
    cubit.register(
      registrationId: 'test',
      ownerId: 'test',
      locations: {'/mail'},
      actions: [
        ShellActionSpec(
          id: 'compose',
          icon: Icons.edit,
          tooltip: 'Compose',
          inDock: true,
          onPressed: () => calls++,
        ),
      ],
    );
    await tester.pumpWidget(
      MaterialApp(
        home: BlocProvider.value(
          value: cubit,
          child: const Scaffold(
            body: FloatingShellDock(
              location: '/mail',
              bottomInset: 68,
              navigation: SizedBox(
                width: 160,
                height: 60,
                child: Text('Navigation'),
              ),
              child: SizedBox.expand(),
            ),
          ),
        ),
      ),
    );
    expect(find.text('Compose'), findsOneWidget);
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpAndSettle();
    expect(find.text('Compose'), findsNothing);
    expect(find.byTooltip('Compose'), findsOneWidget);
    tester.view.physicalSize = const Size(844, 390);
    await tester.pumpAndSettle();
    expect(find.text('Compose'), findsNothing);
    tester.view.physicalSize = const Size(1194, 834);
    await tester.pumpAndSettle();
    expect(find.text('Compose'), findsOneWidget);
    await tester.tap(find.byType(FilledButton));
    expect(calls, 1);
    expect(tester.takeException(), isNull);
  });
}
