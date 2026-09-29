import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
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
    expect(tester.widget<TextField>(input).focusNode!.hasFocus, isTrue);
    final centers = [
      tester.getCenter(find.byIcon(Icons.search_rounded)).dy,
      tester.getCenter(find.byType(EditableText)).dy,
      tester.getCenter(find.byIcon(Icons.close_rounded)).dy,
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
}
