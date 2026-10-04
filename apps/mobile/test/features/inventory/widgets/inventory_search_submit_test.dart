import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/features/inventory/widgets/inventory_form_scaffold.dart';
import 'package:mobile/features/inventory/widgets/inventory_search_chrome.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';

import '../../../helpers/helpers.dart';

void main() {
  for (final query in ['', '   ', 'synthetic']) {
    testWidgets('mounted Inventory shell search submits "$query"', (
      tester,
    ) async {
      final chrome = ShellChromeActionsCubit();
      final controller = TextEditingController();
      final changes = <String>[];
      addTearDown(chrome.close);
      addTearDown(controller.dispose);
      await tester.pumpApp(
        BlocProvider.value(
          value: chrome,
          child: InventorySearchChrome(
            location: '/inventory',
            controller: controller,
            onChanged: changes.add,
          ),
        ),
      );
      await tester.pump();
      ShellActionSpec action() =>
          chrome.state.resolveForLocation('/inventory').single;
      action().onPressed!();
      await tester.pump();
      expect(action().searchController, controller);
      controller.text = query;
      action().onSearchSubmitted!(query);
      await tester.pump();
      expect(changes, hasLength(1));
      expect(changes.single, query.trim().isEmpty ? '' : query);
      expect(
        action().searchController,
        query.trim().isEmpty ? null : controller,
      );
      expect(controller.text, query.trim().isEmpty ? '' : query);
      final staleSubmit = action().onSearchSubmitted!;
      controller.text = 'new query';
      staleSubmit('old query');
      expect(changes, hasLength(1));
      await tester.pumpApp(const SizedBox());
      staleSubmit('new query');
      expect(changes, hasLength(1));
      expect(tester.takeException(), isNull);
    });

    testWidgets('standalone Inventory form search submits "$query"', (
      tester,
    ) async {
      final controller = TextEditingController();
      final changes = <String>[];
      addTearDown(controller.dispose);
      await tester.pumpApp(
        InventoryFormScaffold(
          title: 'Synthetic form',
          primaryActionLabel: 'Save',
          onPrimaryPressed: () {},
          searchController: controller,
          onSearchChanged: changes.add,
          child: const Text('Synthetic content'),
        ),
      );
      await tester.tap(find.byIcon(Icons.search));
      await tester.pump();
      final field = find.byType(TextField);
      await tester.enterText(field, query);
      changes.clear();
      await tester.testTextInput.receiveAction(TextInputAction.search);
      await tester.pump();
      expect(changes, hasLength(1));
      expect(changes.single, query.trim().isEmpty ? '' : query);
      expect(field, query.trim().isEmpty ? findsNothing : findsOneWidget);
      expect(controller.text, query.trim().isEmpty ? '' : query);
      expect(tester.takeException(), isNull);
    });
  }
}
