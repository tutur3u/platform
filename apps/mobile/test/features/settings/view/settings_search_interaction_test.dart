import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/layout/layout_tokens.dart';
import 'package:mobile/core/ui/components/app_search_field.dart';
import 'package:mobile/features/settings/view/settings_row_layout.dart';
import 'package:mobile/features/settings/view/settings_search.dart';

import '../../../helpers/helpers.dart';

void main() {
  testWidgets(
    'fallback search uses shared field and tracks controller clears',
    (tester) async {
      final controller = TextEditingController();
      addTearDown(controller.dispose);
      final queries = <String>[];
      await tester.pumpApp(
        SettingsSearchField(controller: controller, onChanged: queries.add),
      );
      expect(find.byType(AppSearchField), findsOneWidget);
      const clearKey = ValueKey('settings-search-clear');
      expect(find.byKey(clearKey), findsNothing);

      // A retained controller can change without rebuilding the Settings route.
      controller.text = 'Timezone';
      await tester.pump();
      expect(find.byKey(clearKey), findsOneWidget);
      await tester.tap(find.byKey(clearKey));
      await tester.pump();
      expect(controller.text, isEmpty);
      expect(queries, ['']);
      expect(find.byKey(clearKey), findsNothing);
    },
  );

  testWidgets('opening a search result dismisses the query keyboard', (
    tester,
  ) async {
    final focus = FocusNode();
    addTearDown(focus.dispose);
    var opened = 0;
    await tester.pumpApp(
      Column(
        children: [
          TextField(focusNode: focus),
          SettingsSearchResults(
            query: 'timezone',
            results: [
              SettingsSearchEntry(
                id: 'timezone',
                icon: Icons.schedule,
                title: 'Timezone',
                section: 'General',
                onOpen: () => opened++,
              ),
            ],
          ),
        ],
      ),
    );
    focus.requestFocus();
    await tester.pump();
    expect(focus.hasFocus, isTrue);
    await tester.tap(find.byKey(const ValueKey('settings-search-timezone')));
    await tester.pump();
    expect(opened, 1);
    expect(focus.hasFocus, isFalse);
  });
  testWidgets('settings scroll padding clears keyboard and safe area', (
    tester,
  ) async {
    late EdgeInsets padding;
    Future<void> measure(double keyboard) => tester.pumpApp(
      MediaQuery(
        data: MediaQueryData(
          padding: const EdgeInsets.only(bottom: 34),
          viewInsets: EdgeInsets.only(bottom: keyboard),
        ),
        child: Builder(
          builder: (context) {
            padding = SettingsRowLayout.scrollPadding(context, 20);
            return const SizedBox();
          },
        ),
      ),
    );
    await measure(0);
    expect(padding.bottom, 34 + AppLayout.scrollEndGap);
    await measure(300);
    expect(padding.bottom, 300 + AppLayout.scrollEndGap);
    expect(padding.left, 20);
  });
}
