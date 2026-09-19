import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/apps/widgets/apps_dropdown_picker.dart';

import '../../helpers/helpers.dart';

void main() {
  for (final size in [const Size(390, 844), const Size(1024, 768)]) {
    testWidgets('app picker searches visible apps at $size', (tester) async {
      tester.view
        ..devicePixelRatio = 1
        ..physicalSize = size;
      addTearDown(() {
        tester.view.resetPhysicalSize();
        tester.view.resetDevicePixelRatio();
      });
      await tester.pumpApp(
        const Scaffold(
          body: Align(
            alignment: Alignment.topLeft,
            child: AppsDropdownPicker(),
          ),
        ),
      );
      await tester.tap(find.byTooltip('Apps'));
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextField), 'calendar');
      await tester.pumpAndSettle();
      expect(find.text('Calendar'), findsOneWidget);
      expect(find.text('Tasks'), findsNothing);
      await tester.enterText(find.byType(TextField), 'no-such-app');
      await tester.pumpAndSettle();
      expect(find.text('No apps found'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }
}
