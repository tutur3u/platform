import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';

import '../../../helpers/helpers.dart';

void main() {
  for (final width in [320.0, 430.0]) {
    testWidgets('secondary action remains reachable width$width', (
      tester,
    ) async {
      tester.view.physicalSize = Size(width, 900);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      final cubit = ShellChromeActionsCubit();
      addTearDown(cubit.close);
      var calls = 0;
      cubit.register(
        registrationId: 'test',
        ownerId: 'test',
        locations: {'/test'},
        actions: [
          const ShellActionSpec(id: 'create', icon: Icons.add, inDock: true),
          ShellActionSpec(
            id: 'search',
            icon: Icons.search,
            inDock: true,
            tooltip: 'Search',
            onPressed: () => calls++,
          ),
        ],
      );
      await tester.pumpApp(
        BlocProvider.value(
          value: cubit,
          child: const ShellInjectedActionsHost(matchedLocation: '/test'),
        ),
      );
      await tester.pumpAndSettle();
      if (width < 400) {
        expect(find.byIcon(Icons.search), findsOneWidget);
        await tester.tap(find.byIcon(Icons.search));
        expect(calls, 1);
      } else {
        expect(find.byIcon(Icons.search), findsNothing);
      }
      expect(find.byIcon(Icons.add), findsNothing);
      expect(tester.takeException(), isNull);
    });
  }
}
