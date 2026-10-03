import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/inventory/widgets/inventory_form_scaffold.dart';

import '../../../helpers/helpers.dart';

void main() {
  testWidgets(
    'form actions wrap at 320 pixels with large text and expose readiness',
    (tester) async {
      tester.view
        ..physicalSize = const Size(320, 900)
        ..devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);
      await tester.pumpApp(
        Builder(
          builder: (context) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(textScaler: const TextScaler.linear(2)),
            child: const InventoryFormScaffold(
              title: 'Synthetic form',
              primaryActionLabel: 'Create product',
              onPrimaryPressed: null,
              child: SingleChildScrollView(
                child: Text('Synthetic prerequisite state'),
              ),
            ),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(find.text('Synthetic prerequisite state'), findsOneWidget);
      expect(find.text('Create product'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets(
    'keyboard hides floating form actions and restores them when closed',
    (tester) async {
      final keyboard = ValueNotifier<bool>(true);
      addTearDown(keyboard.dispose);
      await tester.pumpApp(
        ValueListenableBuilder<bool>(
          valueListenable: keyboard,
          builder: (context, open, _) => MediaQuery(
            data: MediaQuery.of(
              context,
            ).copyWith(viewInsets: EdgeInsets.only(bottom: open ? 240 : 0)),
            child: InventoryFormScaffold(
              title: 'Synthetic form',
              primaryActionLabel: 'Save synthetic',
              onPrimaryPressed: () {},
              child: ListView(
                children: const [Text('Form content remains visible')],
              ),
            ),
          ),
        ),
      );
      await tester.pump();
      expect(find.text('Save synthetic'), findsNothing);
      expect(find.text('Form content remains visible'), findsOneWidget);
      keyboard.value = false;
      await tester.pump();
      expect(find.text('Save synthetic'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
}
