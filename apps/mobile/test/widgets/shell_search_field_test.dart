import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/core/ui/icons/app_icons.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_search_field.dart';

import '../helpers/helpers.dart';

void main() {
  testWidgets('search opens focused and aligns both icons with the input', (
    tester,
  ) async {
    final controller = TextEditingController();
    addTearDown(controller.dispose);
    await tester.pumpApp(
      Center(
        child: SizedBox(
          width: 320,
          child: ShellSearchField(
            action: ShellActionSpec(
              id: 'test-search',
              icon: Icons.search,
              searchController: controller,
              searchHint: 'Search',
            ),
          ),
        ),
      ),
    );
    await tester.pump();
    final input = find.byKey(const ValueKey('shell-search-query'));
    expect(
      tester
          .widget<TextField>(
            find.descendant(of: input, matching: find.byType(TextField)),
          )
          .focusNode!
          .hasFocus,
      isTrue,
    );
    final centers = [
      tester.getCenter(find.byIcon(AppIcons.search)).dy,
      tester.getCenter(find.byType(EditableText)).dy,
      tester.getCenter(find.byIcon(AppIcons.close)).dy,
    ];
    expect(centers[0], closeTo(centers[1], 1));
    expect(centers[2], closeTo(centers[1], 1));
  });

  testWidgets('empty search submit closes search mode', (tester) async {
    final controller = TextEditingController();
    addTearDown(controller.dispose);
    late StateSetter rebuild;
    var searching = true;
    await tester.pumpApp(
      StatefulBuilder(
        builder: (context, setState) {
          rebuild = setState;
          return searching
              ? ShellSearchField(
                  action: ShellActionSpec(
                    id: 'test-search',
                    icon: Icons.search,
                    searchController: controller,
                    onCloseSearch: () => rebuild(() => searching = false),
                  ),
                )
              : const Text('Closed');
        },
      ),
    );
    await tester.pump();
    await tester.enterText(
      find.byKey(const ValueKey('shell-search-query')),
      '   ',
    );
    await tester.testTextInput.receiveAction(TextInputAction.search);
    await tester.pump();
    expect(find.text('Closed'), findsOneWidget);
    expect(find.byKey(const ValueKey('shell-search-query')), findsNothing);
  });
  testWidgets('close and outside tap dismiss the search keyboard', (
    tester,
  ) async {
    final controller = TextEditingController();
    addTearDown(controller.dispose);
    var closes = 0;
    await tester.pumpApp(
      Column(
        children: [
          ShellSearchField(
            action: ShellActionSpec(
              id: 'search',
              icon: Icons.search,
              searchController: controller,
              onCloseSearch: () => closes++,
            ),
          ),
          Expanded(
            child: GestureDetector(
              key: const ValueKey('outside'),
              behavior: HitTestBehavior.opaque,
              onTap: () {},
              child: const SizedBox.expand(),
            ),
          ),
        ],
      ),
    );
    await tester.pump();
    expect(tester.testTextInput.isVisible, isTrue);
    await tester.tap(find.byKey(const ValueKey('outside')));
    await tester.pump();
    expect(
      FocusManager.instance.primaryFocus?.debugLabel,
      isNot('shell-search'),
    );
    expect(tester.testTextInput.isVisible, isFalse);
    await tester.tap(find.byType(TextField));
    await tester.pump();
    await tester.tap(find.byIcon(AppIcons.close));
    await tester.pump();
    expect(closes, 1);
    expect(tester.testTextInput.isVisible, isFalse);
  });

  testWidgets('submit and route removal release keyboard focus', (
    tester,
  ) async {
    final controller = TextEditingController();
    addTearDown(controller.dispose);
    var submitted = '';
    await tester.pumpApp(
      ShellSearchField(
        action: ShellActionSpec(
          id: 'search',
          icon: Icons.search,
          searchController: controller,
          onSearchSubmitted: (value) => submitted = value,
        ),
      ),
    );
    await tester.pump();
    await tester.enterText(find.byType(TextField), 'privacy');
    await tester.testTextInput.receiveAction(TextInputAction.search);
    await tester.pump();
    expect(submitted, 'privacy');
    expect(tester.testTextInput.isVisible, isFalse);
    await tester.tap(find.byType(TextField));
    await tester.pump();
    await tester.pumpApp(const SizedBox());
    await tester.pump();
    expect(tester.testTextInput.isVisible, isFalse);
  });

  testWidgets('dragging content dismisses active search', (tester) async {
    final controller = TextEditingController();
    addTearDown(controller.dispose);
    await tester.pumpApp(
      Column(
        children: [
          ShellSearchField(
            action: ShellActionSpec(
              id: 'search',
              icon: Icons.search,
              searchController: controller,
            ),
          ),
          Expanded(
            child: ListView.builder(
              itemCount: 40,
              itemBuilder: (_, i) =>
                  SizedBox(height: 64, child: Text('Result $i')),
            ),
          ),
        ],
      ),
    );
    await tester.pump();
    expect(tester.testTextInput.isVisible, isTrue);
    await tester.drag(find.byType(ListView), const Offset(0, -200));
    await tester.pump();
    expect(tester.testTextInput.isVisible, isFalse);
  });
  testWidgets('internal controller preserves editing and explicit unfocus', (
    tester,
  ) async {
    var query = '';
    await tester.pumpApp(
      ShellSearchField(
        action: ShellActionSpec(
          id: 'search',
          icon: Icons.search,
          onSearchChanged: (value) => query = value,
        ),
      ),
    );
    await tester.pump();
    await tester.enterText(find.byType(TextField), 'privacy');
    expect(query, 'privacy');
    tester.widget<TextField>(find.byType(TextField)).focusNode!.unfocus();
    await tester.pump();
    expect(tester.testTextInput.isVisible, isFalse);
  });
}
